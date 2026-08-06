import { describe, expect, it } from 'vitest';
import type { UnlockId } from '../src/game/types';
import { createInitialState, hasUnlock } from '../src/game/GameState';
import {
  MISSIONS,
  UNLOCKS,
  activeMission,
  buyUnlock,
  evaluateMissions,
  getUnlock,
  isPurchasable,
  missionProgress,
  purchaseBlocker,
  unlockedCommands,
  visibleUnlocks,
} from '../src/game/progression';

describe('tables', () => {
  it('has unique unlock and mission ids', () => {
    const unlockIds = UNLOCKS.map((unlock) => unlock.id);
    const missionIds = MISSIONS.map((mission) => mission.id);
    expect(new Set(unlockIds).size).toBe(unlockIds.length);
    expect(new Set(missionIds).size).toBe(missionIds.length);
  });

  it('only references unlocks and missions that exist', () => {
    const unlockIds = new Set(UNLOCKS.map((unlock) => unlock.id));
    const missionIds = new Set(MISSIONS.map((mission) => mission.id));

    for (const unlock of UNLOCKS) {
      for (const required of unlock.requiresUnlocks ?? []) expect(unlockIds.has(required)).toBe(true);
      if (unlock.requiresMission) expect(missionIds.has(unlock.requiresMission)).toBe(true);
    }
    for (const mission of MISSIONS) {
      for (const granted of mission.grants) expect(unlockIds.has(granted)).toBe(true);
    }
  });

  it('gives the player exactly move, mine and print to start with', () => {
    const state = createInitialState();
    // The readers and reset() are never locked, so they are always in the list.
    expect(unlockedCommands(state)).toEqual([
      'credits',
      'inventory',
      'mine',
      'move',
      'position',
      'print',
      'reset',
    ]);
  });

  it('exposes both craft and take from one unlock', () => {
    expect(getUnlock('craft')?.commands).toEqual(['craft', 'take']);
  });
});

describe('missions', () => {
  it('starts on the first mission', () => {
    expect(activeMission(createInitialState())?.id).toBe('m1_move');
  });

  it('caps reported progress at the target', () => {
    const state = createInitialState();
    state.stats.tilesMoved = 500;
    expect(missionProgress(state, MISSIONS[0]!)).toMatchObject({ current: 20, complete: true });
  });

  it('counts crafted goods per resource', () => {
    const state = createInitialState();
    state.stats.crafted = { iron_ingot: 4 };
    const smelting = MISSIONS.find((mission) => mission.id === 'm4_smelt')!;
    expect(missionProgress(state, smelting)).toMatchObject({ current: 4, complete: false });
  });

  it('completes a mission once and pays the reward', () => {
    const state = createInitialState();
    state.stats.tilesMoved = 20;

    const first = evaluateMissions(state);
    expect(first).toHaveLength(1);
    expect(first[0]?.mission.id).toBe('m1_move');
    expect(state.credits).toBe(40);
    expect(hasUnlock(state, 'sell')).toBe(true);

    expect(evaluateMissions(state)).toHaveLength(0);
    expect(state.credits).toBe(40);
  });

  it('keeps the chain in order — a later goal alone completes nothing', () => {
    const state = createInitialState();
    state.stats.creditsEarned = 5000;

    expect(evaluateMissions(state)).toHaveLength(0);
    expect(activeMission(state)?.id).toBe('m1_move');
  });

  it('completes several missions in one pass when all their goals are met', () => {
    const state = createInitialState();
    state.stats.tilesMoved = 100;
    state.stats.oreMined = 100;
    state.stats.creditsEarned = 500;

    const completed = evaluateMissions(state).map((entry) => entry.mission.id);

    expect(completed).toEqual(['m1_move', 'm2_mine', 'm3_earn']);
    expect(activeMission(state)?.id).toBe('m4_smelt');
  });
});

describe('shop', () => {
  it('names the reason a card is locked', () => {
    const state = createInitialState();

    expect(purchaseBlocker(state, 'move')).toBe('already_owned');
    expect(purchaseBlocker(state, 'scan')).toBe('mission_locked');
    expect(purchaseBlocker(state, 'sell')).toBe('too_expensive');
    expect(purchaseBlocker(state, 'craft')).toBe('unlock_locked');
  });

  it('refuses a purchase the player cannot afford and keeps the credits', () => {
    const state = createInitialState();
    state.credits = 10;

    const result = buyUnlock(state, 'sell');

    expect(result).toMatchObject({ ok: false, reason: 'too_expensive' });
    expect(state.credits).toBe(10);
    expect(hasUnlock(state, 'sell')).toBe(false);
  });

  it('charges for a purchase and unlocks the command', () => {
    const state = createInitialState();
    state.credits = 200;

    expect(buyUnlock(state, 'sell').ok).toBe(true);

    expect(state.credits).toBe(140);
    expect(unlockedCommands(state)).toContain('sell');
    expect(isPurchasable(state, 'sell')).toBe(false);
  });

  it('hides the free starting commands but keeps everything with a price', () => {
    const listed = visibleUnlocks(createInitialState()).map((unlock) => unlock.id);

    // move/mine/print are owned and cost nothing, so a card for them would be a
    // row the player can never act on.
    expect(listed).not.toContain('move');
    expect(listed).not.toContain('mine');
    expect(listed).not.toContain('print');

    // A locked node stays on the shelf: seeing what comes next is the point.
    expect(listed).toContain('scan');
    expect(listed).toContain('robot_2');
  });

  it('keeps a paid unlock on the shelf after it is bought', () => {
    const state = createInitialState();
    state.credits = 500;
    buyUnlock(state, 'sell');

    expect(visibleUnlocks(state).map((unlock) => unlock.id)).toContain('sell');
  });

  it('rejects an unknown upgrade', () => {
    const state = createInitialState();
    expect(buyUnlock(state, 'teleport' as UnlockId)).toMatchObject({
      ok: false,
      reason: 'unknown_unlock',
    });
  });

  it('respects prerequisites in both directions', () => {
    const state = createInitialState();
    state.credits = 10_000;
    state.completedMissions = ['m2_mine'];

    expect(buyUnlock(state, 'craft').ok).toBe(false);
    expect(buyUnlock(state, 'drop').ok).toBe(true);
    expect(buyUnlock(state, 'craft').ok).toBe(true);
  });
});

describe('unlock effects', () => {
  it('raises the carrying capacity', () => {
    const state = createInitialState();
    state.credits = 10_000;

    buyUnlock(state, 'capacity_20');
    expect(state.inventoryCapacity).toBe(20);

    buyUnlock(state, 'capacity_50');
    expect(state.inventoryCapacity).toBe(50);
  });

  it('speeds the robot up and never slows it back down', () => {
    const state = createInitialState();
    state.credits = 10_000;

    buyUnlock(state, 'tick_300');
    buyUnlock(state, 'tick_200');
    expect(state.tickRateMs).toBe(200);
  });

  it('grows the factory without moving anything', () => {
    const state = createInitialState();
    state.credits = 10_000;
    const market = state.grid.tiles[0];

    buyUnlock(state, 'grid_12');

    expect(state.grid.width).toBe(12);
    expect(state.grid.tiles).toHaveLength(144);
    expect(state.grid.tiles[0]).toBe(market);
  });

  it('adds a second robot on a free tile', () => {
    const state = createInitialState();
    state.credits = 10_000;
    state.completedMissions = [...MISSIONS.map((mission) => mission.id)];

    expect(buyUnlock(state, 'robot_2').ok).toBe(true);

    expect(state.robots).toHaveLength(2);
    const [first, second] = state.robots;
    expect(second?.id).toBe('r2');
    expect(`${second?.x},${second?.y}`).not.toBe(`${first?.x},${first?.y}`);
  });
});
