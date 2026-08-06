import { describe, expect, it } from 'vitest';
import { craft, drop, mine, move, scan, scanAt, sell, take } from '../src/engine/commands';
import { ORE_NODE_AMOUNT } from '../src/game/GameState';
import {
  ctxOf,
  expectFail,
  expectOk,
  idle,
  machineAt,
  oreAt,
  robotOf,
  runTick,
  stateFromLayout,
} from './helpers';

const LAYOUT = [
  'M.I.',
  '..S.',
  '..A.',
  '.C..',
];

describe('move', () => {
  it('walks one tile and counts it', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);

    expectOk(runTick(state, (ctx) => move(ctx, 'east')));

    expect(robotOf(state)).toMatchObject({ x: 2, y: 1, facing: 'east' });
    expect(state.stats.tilesMoved).toBe(1);
  });

  it('treats north as up on the screen', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    runTick(state, (ctx) => move(ctx, 'north'));
    expect(robotOf(state).y).toBe(0);
  });

  it('refuses to leave the factory but still turns', () => {
    const state = stateFromLayout(LAYOUT, 0, 0);

    const result = expectFail(runTick(state, (ctx) => move(ctx, 'west')));

    expect(result.code).toBe('blocked');
    expect(robotOf(state)).toMatchObject({ x: 0, y: 0, facing: 'west' });
    expect(state.stats.tilesMoved).toBe(0);
  });

  it('explains a bad direction instead of silently doing nothing', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);

    const result = expectFail(runTick(state, (ctx) => move(ctx, 'up')));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain("'north'");
  });
});

describe('mine', () => {
  it('takes one unit per tick', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);

    expectOk(runTick(state, mine));

    expect(robotOf(state).inventory).toEqual({ iron_ore: 1 });
    expect(oreAt(state, 2, 0).amount).toBe(ORE_NODE_AMOUNT - 1);
    expect(state.stats.oreMined).toBe(1);
  });

  it('fails on a tile without ore', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    expect(expectFail(runTick(state, mine)).code).toBe('nothing_here');
  });

  it('schedules regrowth when a node runs dry and refills it later', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);
    state.inventoryCapacity = 100;
    state.oreRegrowTicks = 5;
    oreAt(state, 2, 0).amount = 1;

    runTick(state, mine);
    const node = oreAt(state, 2, 0);
    expect(node.amount).toBe(0);
    expect(node.regrowAt).toBe(state.tick + 5);

    expect(expectFail(runTick(state, mine)).code).toBe('depleted');

    idle(state, 6);
    expect(oreAt(state, 2, 0).amount).toBe(ORE_NODE_AMOUNT);
    expect(oreAt(state, 2, 0).regrowAt).toBeNull();
  });

  it('stops at the carrying capacity', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);
    state.inventoryCapacity = 2;

    runTick(state, mine);
    runTick(state, mine);
    const result = expectFail(runTick(state, mine));

    expect(result.code).toBe('inventory_full');
    expect(robotOf(state).inventory).toEqual({ iron_ore: 2 });
  });
});

describe('drop', () => {
  it('loads everything the machine can use', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    robotOf(state).inventory = { iron_ore: 3, copper_ore: 1 };

    expectOk(runTick(state, drop));

    expect(machineAt(state, 2, 1).input).toEqual({ iron_ore: 3, copper_ore: 1 });
    expect(robotOf(state).inventory).toEqual({});
  });

  it('keeps what the machine cannot use', () => {
    const state = stateFromLayout(LAYOUT, 2, 2);
    robotOf(state).inventory = { iron_ingot: 2, iron_ore: 4 };

    expectOk(runTick(state, drop));

    expect(machineAt(state, 2, 2).input).toEqual({ iron_ingot: 2 });
    expect(robotOf(state).inventory).toEqual({ iron_ore: 4 });
  });

  it('explains when nothing fits', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    robotOf(state).inventory = { gear: 1 };

    const result = expectFail(runTick(state, drop));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('smelter');
  });

  it('needs a machine and something to give', () => {
    const empty = stateFromLayout(LAYOUT, 1, 1);
    expect(expectFail(runTick(empty, drop)).code).toBe('nothing_here');

    const machine = stateFromLayout(LAYOUT, 2, 1);
    expect(expectFail(runTick(machine, drop)).code).toBe('inventory_empty');
  });
});

describe('craft and take', () => {
  it('consumes the inputs, runs for the recipe time, then hands over the output', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    machineAt(state, 2, 1).input = { iron_ore: 1 };

    expectOk(runTick(state, craft));

    const smelter = machineAt(state, 2, 1);
    expect(smelter.input).toEqual({});
    expect(smelter.job).toEqual({ recipeId: 'smelt_iron', readyAt: state.tick + 4 });

    expect(expectFail(runTick(state, take)).code).toBe('not_ready');

    idle(state, 4);
    expect(smelter.job).toBeNull();
    expect(smelter.output).toEqual({ iron_ingot: 1 });
    expect(state.stats.crafted).toEqual({ iron_ingot: 1 });

    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({ iron_ingot: 1 });
    expect(smelter.output).toEqual({});
  });

  it('does not block the robot while the machine works', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    machineAt(state, 2, 1).input = { iron_ore: 1 };
    runTick(state, craft);

    expectOk(runTick(state, (ctx) => move(ctx, 'west')));
    expect(robotOf(state).x).toBe(1);
    expect(machineAt(state, 2, 1).job).not.toBeNull();
  });

  it('refuses to start twice', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    machineAt(state, 2, 1).input = { iron_ore: 2 };

    runTick(state, craft);
    expect(expectFail(runTick(state, craft)).code).toBe('busy');
  });

  it('says what is missing', () => {
    const state = stateFromLayout(LAYOUT, 2, 2);
    machineAt(state, 2, 2).input = { iron_ingot: 1 };

    const result = expectFail(runTick(state, craft));

    expect(result.code).toBe('missing_input');
    expect(result.error).toContain('1 iron ingot');
  });

  it('only takes as much as the robot can carry', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    state.inventoryCapacity = 2;
    machineAt(state, 2, 1).output = { iron_ingot: 5 };

    expectOk(runTick(state, take));

    expect(robotOf(state).inventory).toEqual({ iron_ingot: 2 });
    expect(machineAt(state, 2, 1).output).toEqual({ iron_ingot: 3 });
    expect(expectFail(runTick(state, take)).code).toBe('inventory_full');
  });

  it('reports an idle, empty machine as empty rather than not ready', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    expect(expectFail(runTick(state, take)).code).toBe('inventory_empty');
  });
});

describe('sell', () => {
  it('pays out on the market tile', () => {
    const state = stateFromLayout(LAYOUT, 0, 0);
    robotOf(state).inventory = { iron_ore: 2, gear: 1 };

    const result = expectOk(runTick(state, sell));

    expect(result.value).toBe(46);
    expect(state.credits).toBe(46);
    expect(robotOf(state).inventory).toEqual({});
  });

  it('only works on the market', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    robotOf(state).inventory = { gear: 1 };
    expect(expectFail(runTick(state, sell)).code).toBe('nothing_here');
  });

  it('needs something to sell', () => {
    const state = stateFromLayout(LAYOUT, 0, 0);
    expect(expectFail(runTick(state, sell)).code).toBe('inventory_empty');
  });
});

describe('scan', () => {
  it('describes the tile under the robot', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);
    expect(expectOk(runTick(state, scan)).value).toEqual({
      type: 'ore',
      x: 2,
      y: 0,
      resource: 'iron_ore',
      amount: ORE_NODE_AMOUNT,
    });
  });

  it('reports how long a machine still needs', () => {
    const state = stateFromLayout(LAYOUT, 2, 1);
    machineAt(state, 2, 1).input = { iron_ore: 1 };
    runTick(state, craft);

    const value = expectOk(scanAt(ctxOf(state), 2, 1)).value as Record<string, unknown>;

    expect(value).toMatchObject({ type: 'machine', machine: 'smelter', busy: true, readyIn: 4 });
  });

  it('refuses coordinates outside the factory', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    const result = expectFail(scanAt(ctxOf(state), 9, 9));
    expect(result.code).toBe('out_of_bounds');
    expect(result.error).toContain('4 by 4');
  });

  it('refuses non-numeric coordinates', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    expect(expectFail(scanAt(ctxOf(state), '1', 1)).code).toBe('bad_argument');
  });
});
