import { describe, expect, it } from 'vitest';
import type { MachineTile } from '../src/game/types';
import { pour } from '../src/engine/commands';
import { expectFail, expectOk, machineAt, robotOf, runTick, stateFromLayout } from './helpers';

/**
 * A foundry at (1,0) with a smelter above it (1,... no) — layout below puts the
 * foundry at (1,1) with smelters north (1,0) and south (1,2).
 *   . S .
 *   . F .
 *   . S .
 * The robot stands on the foundry.
 */
function foundryState(): ReturnType<typeof stateFromLayout> {
  const state = stateFromLayout(['.S.', '.F.', '.S.'], 1, 1);
  const foundry = machineAt(state, 1, 1);
  foundry.order = { need: 2 };
  return state;
}

function heat(tile: MachineTile): void {
  tile.output = { iron_ingot: 1 };
}

describe('foundry pour', () => {
  it('casts one alloy per smelter when all of them are hot', () => {
    const state = foundryState();
    heat(machineAt(state, 1, 0));
    heat(machineAt(state, 1, 2));

    const result = expectOk(runTick(state, pour));

    expect(result.value).toBe(2);
    expect(robotOf(state).inventory).toEqual({ alloy: 2 });
    // Each smelter gave up one ingot.
    expect(machineAt(state, 1, 0).output).toEqual({});
    expect(machineAt(state, 1, 2).output).toEqual({});
  });

  it('fails and scraps the cast when one smelter is cold', () => {
    const state = foundryState();
    heat(machineAt(state, 1, 0)); // hot
    // (1,2) left cold

    expect(expectFail(runTick(state, pour)).code).toBe('blocked');
    // The hot smelter was emptied with the failed pour; no alloy was made.
    expect(machineAt(state, 1, 0).output).toEqual({});
    expect(robotOf(state).inventory['alloy'] ?? 0).toBe(0);
  });

  it('needs at least as many smelters as the order asks for', () => {
    // Only one smelter around the foundry, but the order needs two.
    const state = stateFromLayout(['.S.', '.F.', '...'], 1, 1);
    machineAt(state, 1, 1).order = { need: 2 };
    heat(machineAt(state, 1, 0));

    expect(expectFail(runTick(state, pour)).code).toBe('missing_input');
  });

  it('only works on the foundry', () => {
    const state = stateFromLayout(['..'], 0, 0);
    expect(expectFail(runTick(state, pour)).code).toBe('nothing_here');
  });
});
