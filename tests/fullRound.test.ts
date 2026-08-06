import { describe, expect, it } from 'vitest';
import { craft, drop, mine, sell, take } from '../src/engine/commands';
import { createInitialState, hasUnlock } from '../src/game/GameState';
import { buyUnlock, evaluateMissions } from '../src/game/progression';
import { deserialize, serialize } from '../src/game/saveLoad';
import { expectOk, idle, machineAt, robotOf, runTick, stateFromLayout, walkTo } from './helpers';

/**
 * The Phase 1 acceptance test: one complete production round played entirely
 * through function calls — no DOM, no worker, no renderer. If this passes, the
 * rules of the game are finished and everything after it is presentation.
 *
 * Coordinates come from the starting layout in GameState.ts:
 *   market (0,0) · iron ore (2,1) · copper ore (1,6) · smelter (3,3) · assembler (4,3)
 */
describe('a full production round', () => {
  it('mines, smelts, assembles, sells and buys an upgrade', () => {
    const state = createInitialState();
    expect(robotOf(state)).toMatchObject({ x: 1, y: 1 });

    // 1 — two iron ore
    walkTo(state, 2, 1);
    expectOk(runTick(state, mine));
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ iron_ore: 2 });

    // 2 — one copper ore
    walkTo(state, 1, 6);
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ iron_ore: 2, copper_ore: 1 });

    // 3 — load the smelter and run it three times
    walkTo(state, 3, 3);
    expectOk(runTick(state, drop));
    expect(machineAt(state, 3, 3).input).toEqual({ iron_ore: 2, copper_ore: 1 });

    for (let run = 0; run < 3; run += 1) {
      expectOk(runTick(state, craft));
      idle(state, 4);
    }

    expect(machineAt(state, 3, 3).input).toEqual({});
    expect(machineAt(state, 3, 3).output).toEqual({ iron_ingot: 2, copper_ingot: 1 });

    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({ iron_ingot: 2, copper_ingot: 1 });

    // 4 — assemble one gear
    walkTo(state, 4, 3);
    expectOk(runTick(state, drop));
    expectOk(runTick(state, craft));
    expect(machineAt(state, 4, 3).job).toMatchObject({ recipeId: 'assemble_gear' });

    idle(state, 8);
    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({ gear: 1 });
    expect(state.stats.crafted).toEqual({ iron_ingot: 2, copper_ingot: 1, gear: 1 });

    // 5 — sell it
    walkTo(state, 0, 0);
    expect(expectOk(runTick(state, sell)).value).toBe(40);
    expect(state.credits).toBe(40);
    expect(robotOf(state).inventory).toEqual({});

    // 6 — the round was long enough to finish the first mission
    expect(state.stats.tilesMoved).toBe(20);
    const completed = evaluateMissions(state);
    expect(completed.map((entry) => entry.mission.id)).toEqual(['m1_move']);
    expect(hasUnlock(state, 'sell')).toBe(true);
    expect(state.credits).toBe(80);

    // 7 — spend the earnings
    expect(buyUnlock(state, 'wait').ok).toBe(true);
    expect(state.credits).toBe(0);
    expect(hasUnlock(state, 'wait')).toBe(true);

    // 8 — and the whole thing survives a save/load cycle
    const reloaded = deserialize(serialize(state));
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.state).toEqual(state);
  });

  it('keeps producing when ore runs out and regrows', () => {
    const state = stateFromLayout(['I.', 'M.'], 0, 0);
    state.oreRegrowTicks = 3;
    state.inventoryCapacity = 50;

    for (let i = 0; i < 20; i += 1) expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ iron_ore: 20 });

    expect(runTick(state, mine).ok).toBe(false);
    idle(state, 4);
    expectOk(runTick(state, mine));
    expect(state.stats.oreMined).toBe(21);
  });
});
