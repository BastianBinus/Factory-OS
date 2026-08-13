import { describe, expect, it } from 'vitest';
import { clear, craft, drop, mine, seed, take } from '../src/engine/commands';
import { createInitialState, hasUnlock } from '../src/game/GameState';
import { GROW_TICKS } from '../src/game/cultivation';
import { oreCount } from '../src/game/batches';
import { totalResources } from '../src/game/economy';
import { buyUnlock } from '../src/game/progression';
import { deserialize, serialize } from '../src/game/saveLoad';
import { expectOk, idle, machineAt, robotOf, runTick, stateFromLayout, walkTo } from './helpers';

/**
 * The acceptance test for the rules: one complete production round played
 * entirely through function calls — no DOM, no worker, no renderer.
 *
 * Coordinates come from INITIAL_LAYOUT in GameState.ts:
 *   market (0,0) · ripe iron (1,1) and (1,6) · ripe copper (6,6)
 *   smelter (3,3) · assembler (4,3) · seeder (2,4)
 */
describe('a full production round', () => {
  it('harvests, smelts, assembles, sells and buys an upgrade', () => {
    const state = createInitialState();
    expect(robotOf(state)).toMatchObject({ x: 1, y: 1 });

    // 1 — the robot starts standing on a ripe iron patch
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ seed_crystal: 1 });
    expect(oreCount(robotOf(state), 'iron_ore')).toBe(3);

    // 2 — copper from the south-east corner
    walkTo(state, 6, 6);
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ seed_crystal: 2 });
    expect(oreCount(robotOf(state), 'iron_ore')).toBe(3);
    expect(oreCount(robotOf(state), 'copper_ore')).toBe(3);

    // 3 — load the smelter and run it six times
    walkTo(state, 3, 3);
    expectOk(runTick(state, drop));
    expect(machineAt(state, 3, 3).input).toEqual({ iron_ore: 3, copper_ore: 3 });

    for (let run = 0; run < 6; run += 1) {
      expectOk(runTick(state, craft));
      idle(state, 4);
    }

    expect(machineAt(state, 3, 3).input).toEqual({});
    expect(machineAt(state, 3, 3).output).toEqual({ iron_ingot: 3, copper_ingot: 3 });

    // The crystals stay in the robot: the smelter has no recipe that takes them.
    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({
      iron_ingot: 3,
      copper_ingot: 3,
      seed_crystal: 2,
    });

    // 4 — assemble one gear
    walkTo(state, 4, 3);
    expectOk(runTick(state, drop));
    expectOk(runTick(state, craft));
    expect(machineAt(state, 4, 3).job).toMatchObject({ recipeId: 'assemble_gear' });

    idle(state, 8);
    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({ gear: 1, seed_crystal: 2 });
    expect(state.stats.crafted).toEqual({ iron_ingot: 3, copper_ingot: 3, gear: 1 });

    // 5 — there is no money: what the robot carries is the whole of its wealth.
    expect(totalResources(state)).toEqual({ gear: 1, seed_crystal: 2 });

    // 6 — a few rounds' worth of metal buys the first upgrade, paid straight out
    // of the fleet's cargo. One round cannot fund it — that stall is the design —
    // so the stock is topped up here to stand in for the rounds in between.
    robotOf(state).inventory = { ...robotOf(state).inventory, iron_ingot: 10 };
    expect(buyUnlock(state, 'capacity_20').ok).toBe(true);
    expect(hasUnlock(state, 'capacity_20')).toBe(true);
    expect(state.inventoryCapacity).toBe(20);
    // The metal was spent, not merely checked: the ingots are gone.
    expect(robotOf(state).inventory['iron_ingot'] ?? 0).toBe(0);

    // 7 — and the whole thing survives a save/load cycle
    const reloaded = deserialize(serialize(state));
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.state).toEqual(state);
  });

  /*
   * The other half of the loop, and the point of the whole phase: production is
   * open-ended only for as long as the robot puts a crop back. Replanting the
   * tile it just harvested is exactly free — one crystal out, one crystal in.
   */
  it('keeps producing for as long as the robot replants', () => {
    const state = stateFromLayout(['I.', 'M.'], 0, 0);
    state.inventoryCapacity = 50;

    for (let round = 0; round < 3; round += 1) {
      expectOk(runTick(state, mine));
      expectOk(runTick(state, clear));
      expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

      // Harvesting early is refused, which is what makes the wait real.
      expect(runTick(state, mine).ok).toBe(false);
      idle(state, GROW_TICKS.iron_ore ?? 0);
    }

    expect(robotOf(state).inventory).toEqual({});
    expect(oreCount(robotOf(state), 'iron_ore')).toBe(9);
    expect(state.stats.oreMined).toBe(9);
  });
});
