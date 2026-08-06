import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createInitialState } from '../src/game/GameState';
import { deserialize, serialize } from '../src/game/saveLoad';

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
