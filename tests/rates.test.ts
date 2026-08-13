import { describe, expect, it } from 'vitest';
import type { GameState, RateSample } from '../src/game/types';
import { createInitialState } from '../src/game/GameState';
import { HISTORY_LIMIT, bottleneck, count, recordSample, windowRate } from '../src/game/rates';

/** A history of `count` samples, each producing `perTick` mine units on tick i. */
function mineHistory(count: number, perTick: number, startTick = 1): RateSample[] {
  return Array.from({ length: count }, (_unused, i) => ({
    tick: startTick + i,
    produced: { mine: perTick },
  }));
}

describe('count and recordSample', () => {
  it('freezes a tick tally into history and starts the next tick clean', () => {
    const state = createInitialState();
    state.tick = 5;
    count(state, 'mine', 3);
    count(state, 'mine', 2); // same tick accumulates
    count(state, 'seed', 1);

    recordSample(state);

    expect(state.history).toEqual([{ tick: 5, produced: { mine: 5, seed: 1 } }]);
    expect(state.tickProduced).toEqual({});
  });

  it('ignores a non-positive count', () => {
    const state = createInitialState();
    count(state, 'smelt', 0);
    count(state, 'smelt', -4);
    expect(state.tickProduced).toEqual({});
  });

  it('keeps the ring buffer at its limit, dropping the oldest', () => {
    const state = createInitialState();

    for (let tick = 1; tick <= HISTORY_LIMIT + 10; tick += 1) {
      state.tick = tick;
      count(state, 'mine', 1);
      recordSample(state);
    }

    expect(state.history).toHaveLength(HISTORY_LIMIT);
    // The first ten ticks have fallen off the front.
    expect(state.history[0]?.tick).toBe(11);
    expect(state.history[state.history.length - 1]?.tick).toBe(HISTORY_LIMIT + 10);
  });
});

describe('windowRate', () => {
  it('sums the window and scales it to a per-minute figure', () => {
    // 60 ticks at 1000 ms each == one minute; 2 mine per tick == 120 per minute.
    const report = windowRate(mineHistory(60, 2), 1000);
    expect(report.totalPerMinute).toBe(120);
    expect(report.stages.find((s) => s.stage === 'mine')?.perMinute).toBe(120);
  });

  it('leaves out samples older than the window', () => {
    // 400 ms/tick -> a 60 s window is 150 ticks. 200 samples: only the last 150 count.
    const report = windowRate(mineHistory(200, 1), 400);
    // 150 ticks * 1 mine, scaled by 60000/60000 = 150 per minute.
    expect(report.totalPerMinute).toBe(150);
  });

  it('reports the delta against the window before', () => {
    // First 60 ticks produce 1/tick, next 60 produce 3/tick, at 1000 ms/tick.
    const slow = mineHistory(60, 1, 1);
    const fast = mineHistory(60, 3, 61);
    const report = windowRate([...slow, ...fast], 1000);

    expect(report.totalPerMinute).toBe(180); // 60 * 3
    expect(report.delta).toBe(120); // 180 now minus 60 before
  });

  it('is empty and flat with no history', () => {
    const report = windowRate([], 400);
    expect(report.totalPerMinute).toBe(0);
    expect(report.delta).toBe(0);
  });
});

describe('bottleneck', () => {
  /** A state with one smelter that has ore waiting in it and empty history. */
  function starvedSmelter(): GameState {
    const state = createInitialState();
    const smelter = state.grid.tiles.find(
      (tile) => tile.kind === 'machine' && tile.machine === 'smelter',
    );
    if (smelter?.kind === 'machine') smelter.input = { iron_ore: 3 };
    return state;
  }

  it('flags a stage with material waiting and nothing coming out', () => {
    const result = bottleneck(starvedSmelter());
    expect(result?.stage).toBe('smelt');
    expect(result?.reason).toContain('starved');
  });

  it('stays quiet when the stage is actually producing', () => {
    const state = starvedSmelter();
    // Recent output means the flow is fine, waiting input or not.
    state.tick = 10;
    state.history = mineHistory(5, 1, 6).map((sample) => ({
      tick: sample.tick,
      produced: { smelt: 2 },
    }));
    expect(bottleneck(state)).toBeNull();
  });

  it('stays quiet when no material is waiting', () => {
    expect(bottleneck(createInitialState())).toBeNull();
  });
});
