import { describe, expect, it } from 'vitest';
import { ONBOARDING_DONE, SAVE_VERSION, createInitialState, hasUnlock } from '../src/game/GameState';
import { deserialize, serialize } from '../src/game/saveLoad';
import { oreCount } from '../src/game/batches';
import { buyUnlock, unlockedCommands } from '../src/game/progression';

function savedState(): Record<string, unknown> {
  return JSON.parse(serialize(createInitialState())) as Record<string, unknown>;
}

describe('round trip', () => {
  it('restores a state that is equal to the original', () => {
    const state = createInitialState();
    state.tick = 99;
    state.script = 'await move("north");';
    state.unlocks = ['move', 'mine', 'print', 'scan'];
    state.robots[0]!.inventory = { iron_ore: 5, gear: 2 };
    state.stats.crafted = { gear: 3 };

    const result = deserialize(serialize(state));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toEqual(state);
    expect(result.migratedFrom).toBeUndefined();
  });

  it('always writes the current version, whatever the state carried', () => {
    const state = createInitialState();
    state.version = 0;
    expect(JSON.parse(serialize(state)).version).toBe(SAVE_VERSION);
  });
});

describe('a played state survives a reload', () => {
  /** Plays far enough that every kind of earned progress is present at once. */
  function playedState() {
    const state = createInitialState();
    state.stats.tilesMoved = 20;
    state.stats.oreMined = 15;
    // Enough metal on hand to buy a few upgrades outright.
    state.robots[0]!.inventory = { iron_ore: 200, iron_ingot: 200, gear: 50 };

    buyUnlock(state, 'scan_at'); // a command (scan itself is a free starter)
    buyUnlock(state, 'grid_12'); // a bigger world
    buyUnlock(state, 'tick_300'); // a faster clock
    buyUnlock(state, 'capacity_20'); // a bigger robot
    state.script = 'while (true) {\n  await move("north");\n}';

    return state;
  }

  it('brings back resources, unlocks, grid, script and stats', () => {
    const state = playedState();
    const result = deserialize(serialize(state));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loaded = result.state;

    expect(loaded.robots[0]?.inventory).toEqual(state.robots[0]?.inventory);
    expect(loaded.unlocks).toEqual(state.unlocks);
    expect(loaded.script).toBe(state.script);
    expect(loaded.grid.width).toBe(12);
    expect(loaded.grid.tiles).toHaveLength(144);
    expect(loaded.tickRateMs).toBe(300);
    expect(loaded.inventoryCapacity).toBe(20);
    expect(loaded.stats).toEqual(state.stats);
  });

  it('leaves the reloaded script able to call everything it could before', () => {
    const loaded = deserialize(serialize(playedState()));

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // The worker builds its API from this list, so a name lost here is a script
    // that stops working purely because the player pressed reload.
    expect(unlockedCommands(loaded.state)).toEqual(unlockedCommands(playedState()));
    expect(hasUnlock(loaded.state, 'scan_at')).toBe(true);
  });
});

describe('rejecting broken saves', () => {
  it('reports an empty slot rather than failing', () => {
    expect(deserialize(null)).toMatchObject({ ok: false, reason: 'empty' });
    expect(deserialize('   ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('survives a half-written save', () => {
    expect(deserialize('{"tick": 12')).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('rejects JSON that is not a state object', () => {
    expect(deserialize('[]')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(deserialize('42')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects a state with a missing field', () => {
    const data = savedState();
    delete data['stats'];
    expect(deserialize(JSON.stringify(data))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects a grid whose tile count does not match its size', () => {
    const data = savedState();
    (data['grid'] as { tiles: unknown[] }).tiles.pop();
    expect(deserialize(JSON.stringify(data))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects a save from a newer game version', () => {
    const data = savedState();
    data['version'] = SAVE_VERSION + 1;
    expect(deserialize(JSON.stringify(data))).toMatchObject({ ok: false, reason: 'too_new' });
  });
});

describe('migration', () => {
  it('fills in everything a pre-versioning save is missing', () => {
    const data = savedState();
    delete data['version'];
    delete data['tickRateMs'];
    delete data['inventoryCapacity'];
    delete data['seenConcepts'];

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(0);
    expect(result.state.version).toBe(SAVE_VERSION);
    expect(result.state.tickRateMs).toBe(400);
    expect(result.state.inventoryCapacity).toBe(10);
    expect(result.state.seenConcepts).toEqual([]);
  });

  it('turns the credits of an old save into ore at the old sell price', () => {
    const data = savedState();
    delete data['version'];
    data['credits'] = 777;
    data['inventoryCapacity'] = 20;

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 777 credits at the old price of three come back as 259 iron ore — now a
    // batch, since the v4→v5 migration moved ore out of the count inventory.
    expect(oreCount(result.state.robots[0]!, 'iron_ore')).toBe(259);
    expect(result.state.robots[0]?.inventory['iron_ore']).toBeUndefined();
    expect(result.state.inventoryCapacity).toBe(20);
    // Migrated all the way through: the throughput ring buffer starts empty.
    expect(result.state.history).toEqual([]);
  });
});

describe('the tutorial step', () => {
  it('survives a reload half-finished', () => {
    const state = createInitialState();
    state.onboardingStep = 2;

    const result = deserialize(serialize(state));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.onboardingStep).toBe(2);
  });

  /*
   * A save written before onboarding existed belongs to someone who has
   * obviously already pressed Run, and it is still a perfectly good save —
   * neither rejecting it nor restarting their tutorial is acceptable.
   */
  it('counts as finished in a save written before the tutorial existed', () => {
    const data = savedState();
    delete data['onboardingStep'];

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.onboardingStep).toBe(ONBOARDING_DONE);
  });

  it('counts as finished when the saved value is nonsense', () => {
    const data = savedState();
    data['onboardingStep'] = 'nearly';

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.onboardingStep).toBe(ONBOARDING_DONE);
  });
});

describe('the cultivation and currency migrations', () => {
  /** A save exactly as version 1 wrote them: ore nodes, floor, oreRegrowTicks. */
  function version1Save(size: number): Record<string, unknown> {
    const data = savedState();
    data['version'] = 1;
    data['oreRegrowTicks'] = 30;
    data['grid'] = {
      width: size,
      height: size,
      tiles: Array.from({ length: size * size }, () => ({
        kind: 'ore',
        resource: 'iron_ore',
        amount: 20,
        regrowAt: null,
      })),
    };
    return data;
  }

  it('rebuilds the factory floor when a save predates cultivation', () => {
    const result = deserialize(JSON.stringify(version1Save(12)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(1);

    const grid = result.state.grid;
    expect(grid.width).toBe(12);
    expect(grid.tiles).toHaveLength(144);
    expect(grid.tiles.map((tile) => tile.kind)).not.toContain('ore');

    // The floor has to come back whole: the machines, a market, and something
    // ripe to harvest. A grid of bare raw ground would be a save nobody can play.
    expect(grid.tiles.filter((tile) => tile.kind === 'machine')).toHaveLength(4);
    expect(grid.tiles.filter((tile) => tile.kind === 'market')).toHaveLength(1);
    expect(
      grid.tiles.filter((tile) => tile.kind === 'ground' && tile.state === 'ripe'),
    ).toHaveLength(3);
  });

  it('keeps the grid at the size the player paid for', () => {
    const result = deserialize(JSON.stringify(version1Save(8)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.grid.width).toBe(8);
    expect(result.state.grid.tiles).toHaveLength(64);
  });

  it('converts credits to ore, drops missions, and removes sell — losing nothing else', () => {
    const data = version1Save(8);
    data['credits'] = 4200;
    data['unlocks'] = ['move', 'mine', 'print', 'sell'];
    data['completedMissions'] = ['m1_move'];
    data['stats'] = {
      tilesMoved: 40,
      oreMined: 25,
      creditsEarned: 900,
      itemsSold: 12,
      crafted: { gear: 2 },
    };

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loaded = result.state;

    // 4200 / 3 = 1400 iron ore, handed to the first robot as a batch.
    expect(oreCount(loaded.robots[0]!, 'iron_ore')).toBe(1400);
    // sell() no longer exists; the rest of the unlocks survive.
    expect(loaded.unlocks).toEqual(['move', 'mine', 'print']);
    // Missions and their bookkeeping are gone; the crafting tally stays.
    expect((loaded as unknown as Record<string, unknown>)['completedMissions']).toBeUndefined();
    expect(loaded.stats.crafted).toEqual({ gear: 2 });
    expect((loaded.stats as unknown as Record<string, unknown>)['creditsEarned']).toBeUndefined();
  });

  it('leaves a save written by this build alone', () => {
    const result = deserialize(serialize(createInitialState()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBeUndefined();
  });

  it('gives a v3 save an empty throughput history', () => {
    const data = savedState();
    data['version'] = 3;
    delete data['history'];
    delete data['tickProduced'];

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(3);
    expect(result.state.history).toEqual([]);
    expect(result.state.tickProduced).toEqual({});
  });

  it('moves a v4 save’s carried ore into batches at the neutral purity', () => {
    const data = savedState();
    data['version'] = 4;
    // A v4 robot kept ore as a plain count; give it some, plus a non-ore item.
    (data['robots'] as Record<string, unknown>[])[0]!['inventory'] = {
      iron_ore: 5,
      seed_crystal: 2,
    };
    delete (data['robots'] as Record<string, unknown>[])[0]!['batches'];

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const robot = result.state.robots[0]!;
    expect(result.migratedFrom).toBe(4);
    expect(oreCount(robot, 'iron_ore')).toBe(5);
    expect(robot.batches).toEqual([{ resource: 'iron_ore', amount: 5, purity: 5 }]);
    // The ore is gone from the count inventory; the crystal stays.
    expect(robot.inventory).toEqual({ seed_crystal: 2 });
  });
});
