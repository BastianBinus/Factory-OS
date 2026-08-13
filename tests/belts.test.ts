import { describe, expect, it } from 'vitest';
import type { BeltTile, Direction, GameState } from '../src/game/types';
import { setTile, tileAt } from '../src/game/grid';
import { belt } from '../src/engine/commands';
import { expectFail, expectOk, idle, machineAt, runTick, stateFromLayout } from './helpers';

function beltAt(state: GameState, x: number, y: number): BeltTile {
  const tile = tileAt(state.grid, x, y);
  if (tile?.kind !== 'belt') throw new Error(`no belt at ${x},${y}`);
  return tile;
}

function layBelt(state: GameState, x: number, y: number, direction: Direction, item: string | null = null): void {
  setTile(state.grid, x, y, { kind: 'belt', direction, item: item as BeltTile['item'] });
}

describe('belt()', () => {
  it('lays a belt on raw ground', () => {
    const state = stateFromLayout(['..'], 0, 0);
    expectOk(runTick(state, (ctx) => belt(ctx, 'east')));
    expect(beltAt(state, 0, 0).direction).toBe('east');
  });

  it('refuses anything but raw ground', () => {
    const state = stateFromLayout(['M.'], 0, 0); // standing on the market
    expect(expectFail(runTick(state, (ctx) => belt(ctx, 'east'))).code).toBe('nothing_here');
  });
});

describe('belt movement', () => {
  it('carries an item one tile per tick, no leapfrogging', () => {
    const state = stateFromLayout(['....'], 0, 0);
    layBelt(state, 0, 0, 'east', 'iron_ingot');
    layBelt(state, 1, 0, 'east');
    layBelt(state, 2, 0, 'east');

    idle(state, 1);
    expect(beltAt(state, 0, 0).item).toBeNull();
    expect(beltAt(state, 1, 0).item).toBe('iron_ingot');
    // Exactly one tile: it did not skip ahead to (2,0).
    expect(beltAt(state, 2, 0).item).toBeNull();

    idle(state, 1);
    expect(beltAt(state, 2, 0).item).toBe('iron_ingot');
  });

  it('drops its item into a machine that accepts it', () => {
    const state = stateFromLayout(['..', 'S.'], 0, 0);
    // Belt at (0,0) running south into the smelter at (0,1).
    layBelt(state, 0, 0, 'south', 'iron_ore');

    idle(state, 1);

    expect(beltAt(state, 0, 0).item).toBeNull();
    expect(machineAt(state, 0, 1).input).toEqual({ iron_ore: 1 });
  });

  it('holds an item the machine ahead will not take', () => {
    const state = stateFromLayout(['..', 'S.'], 0, 0);
    // The smelter takes ore, not gears.
    layBelt(state, 0, 0, 'south', 'gear');

    idle(state, 1);

    expect(beltAt(state, 0, 0).item).toBe('gear');
    expect(machineAt(state, 0, 1).input).toEqual({});
  });

  it('runs a smelter’s output down a line and into an assembler, no robot', () => {
    const state = stateFromLayout(['SbbA'], 0, 0);
    // Smelter (0,0) with an ingot ready; a belt line east; assembler (3,0).
    machineAt(state, 0, 0).output = { iron_ingot: 1 };
    layBelt(state, 1, 0, 'east');
    layBelt(state, 2, 0, 'east');

    // tick 1 loads off the smelter, 2 and 3 carry it to the assembler.
    idle(state, 3);

    expect(machineAt(state, 0, 0).output).toEqual({});
    expect(machineAt(state, 3, 0).input).toEqual({ iron_ingot: 1 });
  });
});
