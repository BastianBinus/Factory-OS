import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createInitialState, hasUnlock } from '../src/game/GameState';
import { deserialize, serialize } from '../src/game/saveLoad';
import { buyUnlock, evaluateMissions, unlockedCommands } from '../src/game/progression';

function savedState(): Record<string, unknown> {
  return JSON.parse(serialize(createInitialState())) as Record<string, unknown>;
}

describe('round trip', () => {
  it('restores a state that is equal to the original', () => {
    const state = createInitialState();
    state.credits = 1234;
    state.tick = 99;
    state.script = 'await move("north");';
    state.unlocks = ['move', 'mine', 'print', 'sell'];
    state.completedMissions = ['m1_move'];
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
    evaluateMissions(state); // m1 and m2: rewards, and sell() plus wait() granted

    state.credits = 10_000;
    buyUnlock(state, 'scan'); // a command
    buyUnlock(state, 'grid_12'); // a bigger world
    buyUnlock(state, 'tick_300'); // a faster clock
    buyUnlock(state, 'capacity_20'); // a bigger robot
    state.script = 'while (true) {\n  await move("north");\n}';

    return state;
  }

  it('brings back credits, unlocks, grid, script and mission state', () => {
    const state = playedState();
    const result = deserialize(serialize(state));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const loaded = result.state;

    expect(loaded.credits).toBe(state.credits);
    expect(loaded.completedMissions).toEqual(['m1_move', 'm2_mine']);
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
    expect(hasUnlock(loaded.state, 'scan')).toBe(true);
  });

  it('does not hand out a mission reward a second time after loading', () => {
    const loaded = deserialize(serialize(playedState()));

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const before = loaded.state.credits;
    expect(evaluateMissions(loaded.state)).toHaveLength(0);
    expect(loaded.state.credits).toBe(before);
  });
});

describe('rejecting broken saves', () => {
  it('reports an empty slot rather than failing', () => {
    expect(deserialize(null)).toMatchObject({ ok: false, reason: 'empty' });
    expect(deserialize('   ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('survives a half-written save', () => {
    expect(deserialize('{"credits": 12')).toMatchObject({ ok: false, reason: 'unreadable' });
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
    delete data['oreRegrowTicks'];
    delete data['seenConcepts'];

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(0);
    expect(result.state.version).toBe(SAVE_VERSION);
    expect(result.state.tickRateMs).toBe(400);
    expect(result.state.inventoryCapacity).toBe(10);
    expect(result.state.oreRegrowTicks).toBe(30);
    expect(result.state.seenConcepts).toEqual([]);
  });

  it('keeps values an old save already had', () => {
    const data = savedState();
    delete data['version'];
    data['credits'] = 777;
    data['inventoryCapacity'] = 20;

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.credits).toBe(777);
    expect(result.state.inventoryCapacity).toBe(20);
  });
});
