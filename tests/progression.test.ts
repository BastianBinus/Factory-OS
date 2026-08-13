import { describe, expect, it } from 'vitest';
import type { Inventory, UnlockId } from '../src/game/types';
import { createInitialState, hasUnlock } from '../src/game/GameState';
import { BASE_PURITY, addBatch, oreCount } from '../src/game/batches';
import { isOre } from '../src/game/resources';
import {
  UNLOCKS,
  buyUnlock,
  getUnlock,
  isPurchasable,
  nextUnlock,
  purchaseBlocker,
  unlockedCommands,
  visibleUnlocks,
} from '../src/game/progression';

/** Hand the starting robot a pile of resources to shop with. Ore goes to batches. */
function withResources(inventory: Inventory) {
  const state = createInitialState();
  const robot = state.robots[0]!;
  for (const [id, amount] of Object.entries(inventory)) {
    if (isOre(id)) addBatch(robot, id, amount ?? 0, BASE_PURITY);
    else robot.inventory[id as keyof Inventory] = amount;
  }
  return state;
}

/** Enough of everything that only prerequisites, never affordability, can block a buy. */
const RICH: Inventory = { iron_ore: 999, iron_ingot: 999, copper_ingot: 999, gear: 999 };

describe('tables', () => {
  it('has unique unlock ids', () => {
    const ids = UNLOCKS.map((unlock) => unlock.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only requires unlocks that exist', () => {
    const ids = new Set(UNLOCKS.map((unlock) => unlock.id));
    for (const unlock of UNLOCKS) {
      for (const required of unlock.requiresUnlocks ?? []) expect(ids.has(required)).toBe(true);
    }
  });

  it('gives the player everything the growing cycle needs to start with', () => {
    const state = createInitialState();
    // The readers and reset() are never locked, so they are always in the list.
    // The rest is the whole loop: clear, seed, wait for it, look, harvest.
    expect(unlockedCommands(state)).toEqual([
      'clear',
      'inventory',
      'mine',
      'move',
      'position',
      'print',
      'reset',
      'scan',
      'seed',
    ]);
  });

  it('exposes both craft and take from one unlock', () => {
    expect(getUnlock('craft')?.commands).toEqual(['craft', 'take']);
  });
});

describe('shop', () => {
  it('names the reason a card is blocked', () => {
    const state = createInitialState();

    expect(purchaseBlocker(state, 'move')).toBe('already_owned');
    expect(purchaseBlocker(state, 'scan')).toBe('already_owned');
    // Nothing harvested yet, so a priced node is short of resources...
    expect(purchaseBlocker(state, 'trade')).toBe('missing_resources');
    // ...and one behind a prerequisite reports that first.
    expect(purchaseBlocker(state, 'craft')).toBe('unlock_locked');
  });

  it('refuses a purchase the fleet cannot afford and keeps the resources', () => {
    const state = withResources({ iron_ore: 5 });

    const result = buyUnlock(state, 'trade');

    expect(result).toMatchObject({ ok: false, reason: 'missing_resources' });
    expect(oreCount(state.robots[0]!, 'iron_ore')).toBe(5);
    expect(hasUnlock(state, 'trade')).toBe(false);
  });

  it('charges resources for a purchase and unlocks the command', () => {
    const state = withResources({ iron_ore: 10 });

    expect(buyUnlock(state, 'trade').ok).toBe(true);

    expect(oreCount(state.robots[0]!, 'iron_ore')).toBe(0);
    expect(unlockedCommands(state)).toContain('trade');
    expect(isPurchasable(state, 'trade')).toBe(false);
  });

  it('hides the free starting commands but keeps everything with a price', () => {
    const listed = visibleUnlocks(createInitialState()).map((unlock) => unlock.id);

    expect(listed).not.toContain('move');
    expect(listed).not.toContain('mine');
    expect(listed).not.toContain('print');
    expect(listed).not.toContain('scan');
    expect(listed).not.toContain('cultivate');

    // A locked node stays on the shelf: seeing what comes next is the point.
    expect(listed).toContain('scan_at');
    expect(listed).toContain('robot_2');
  });

  it('keeps a paid unlock on the shelf after it is bought', () => {
    const state = withResources(RICH);
    buyUnlock(state, 'trade');

    expect(visibleUnlocks(state).map((unlock) => unlock.id)).toContain('trade');
  });

  it('rejects an unknown upgrade', () => {
    expect(buyUnlock(createInitialState(), 'teleport' as UnlockId)).toMatchObject({
      ok: false,
      reason: 'unknown_unlock',
    });
  });

  it('respects prerequisites: craft needs drop first', () => {
    const state = withResources(RICH);

    expect(buyUnlock(state, 'craft').ok).toBe(false);
    expect(buyUnlock(state, 'drop').ok).toBe(true);
    expect(buyUnlock(state, 'craft').ok).toBe(true);
  });

  it('points at the first affordable-by-dependency node as next', () => {
    // A fresh factory owns the starters, so the cheapest reachable priced node is next.
    expect(nextUnlock(createInitialState())?.id).toBe('trade');
  });
});

describe('unlock effects', () => {
  it('raises the carrying capacity', () => {
    const state = withResources(RICH);

    buyUnlock(state, 'capacity_20');
    expect(state.inventoryCapacity).toBe(20);

    buyUnlock(state, 'capacity_50');
    expect(state.inventoryCapacity).toBe(50);
  });

  it('speeds the robot up and never slows it back down', () => {
    const state = withResources(RICH);

    buyUnlock(state, 'tick_300');
    buyUnlock(state, 'tick_200');
    expect(state.tickRateMs).toBe(200);
  });

  it('grows the factory without moving anything', () => {
    const state = withResources(RICH);
    const market = state.grid.tiles[0];

    buyUnlock(state, 'grid_12');

    expect(state.grid.width).toBe(12);
    expect(state.grid.tiles).toHaveLength(144);
    expect(state.grid.tiles[0]).toBe(market);
  });

  it('adds a second robot on a free tile once the grid is grown', () => {
    const state = withResources(RICH);
    buyUnlock(state, 'grid_12');
    buyUnlock(state, 'grid_16');

    expect(buyUnlock(state, 'robot_2').ok).toBe(true);

    expect(state.robots).toHaveLength(2);
    const [first, second] = state.robots;
    expect(second?.id).toBe('r2');
    expect(`${second?.x},${second?.y}`).not.toBe(`${first?.x},${first?.y}`);
  });
});
