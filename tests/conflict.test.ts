import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/GameState';
import { resolveSaves, summarise, type SaveSummary } from '../src/cloud/conflict';

function save(tick: number, resources: number, unlocks = 0, savedAt = 0): SaveSummary {
  return { tick, resources, unlocks, savedAt };
}

describe('choosing between a local and a cloud save', () => {
  it('keeps the local save when the cloud has none', () => {
    expect(resolveSaves(save(10, 50), null)).toEqual({ kind: 'local' });
  });

  it('takes the cloud save when the browser has none', () => {
    expect(resolveSaves(null, save(10, 50))).toEqual({ kind: 'cloud' });
  });

  it('starts fresh when neither exists', () => {
    expect(resolveSaves(null, null)).toEqual({ kind: 'local' });
  });

  it('takes the cloud save when it contains everything the local one has', () => {
    expect(resolveSaves(save(10, 50), save(80, 400))).toEqual({ kind: 'cloud' });
  });

  it('keeps the local save when it contains everything the cloud one has', () => {
    expect(resolveSaves(save(80, 400), save(10, 50))).toEqual({ kind: 'local' });
  });

  it('does not swap state for an identical save', () => {
    expect(resolveSaves(save(42, 99), save(42, 99))).toEqual({ kind: 'local' });
  });

  /**
   * The case the whole module exists for. Played offline on one machine, played
   * online on another: each save holds progress the other never saw, and no rule
   * can pick a winner without destroying something.
   */
  it('asks the player when each save holds progress the other lacks', () => {
    const local = save(200, 30, 5, 1000);
    const cloud = save(50, 900, 5, 2000);

    expect(resolveSaves(local, cloud)).toEqual({ kind: 'ask', local, cloud });
  });

  /**
   * A wrong system clock must not be able to decide anything. Here the local save
   * claims to be from the future and is still the one that loses, because it is
   * behind on every axis that describes actual progress.
   */
  it('ignores timestamps when deciding, even absurd ones', () => {
    const local = save(1, 1, 0, Date.now() + 5_000_000_000);
    const cloud = save(500, 5000, 5, 0);

    expect(resolveSaves(local, cloud)).toEqual({ kind: 'cloud' });
  });
});

describe('summarising a state', () => {
  it('carries tick, the fleet total, the unlock count and the timestamp', () => {
    const state = createInitialState();
    state.tick = 17;
    state.robots[0]!.inventory = { iron_ore: 3 };
    const unlocks = state.unlocks.length;

    expect(summarise(state, 12345)).toEqual({
      tick: 17,
      resources: 3,
      unlocks,
      savedAt: 12345,
    });
  });
});
