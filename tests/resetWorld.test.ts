import { describe, expect, it } from 'vitest';
import { createInitialState, createRobot, resetWorld } from '../src/game/GameState';
import { expandGrid, tileAt } from '../src/game/grid';
import { unlockedCommands } from '../src/game/progression';
import { mine, move } from '../src/engine/commands';
import type { GameState, MachineTile, OreTile } from '../src/game/types';

/** Plays a few turns so there is something to undo. */
function messUpTheFloor(state: GameState): void {
  const robot = state.robots[0];
  if (!robot) throw new Error('the initial state should have a robot');

  robot.x = 2;
  robot.y = 1;
  mine({ state, robot });
  mine({ state, robot });
  move({ state, robot }, 'south');

  state.tick = 412;
  state.credits = 1340;
  state.unlocks.push('sell');
  state.completedMissions.push('m1_move');
  state.stats.oreMined = 2;

  const smelter = state.grid.tiles.find((tile) => tile.kind === 'machine') as MachineTile;
  smelter.input = { iron_ore: 3 };
  smelter.output = { iron_ingot: 1 };
  smelter.job = { recipeId: 'iron_ingot', readyAt: 500 };
}

describe('resetWorld', () => {
  it('parks the robot back on its starting tile, empty-handed', () => {
    const state = createInitialState();
    const start = { ...state.robots[0]! };
    messUpTheFloor(state);

    resetWorld(state);

    const robot = state.robots[0]!;
    expect(robot.x).toBe(start.x);
    expect(robot.y).toBe(start.y);
    expect(robot.facing).toBe('south');
    expect(robot.inventory).toEqual({});
  });

  it('refills every ore node', () => {
    const state = createInitialState();
    messUpTheFloor(state);
    const before = tileAt(state.grid, 2, 1) as OreTile;
    expect(before.amount).toBeLessThan(20);

    resetWorld(state);

    for (const tile of state.grid.tiles) {
      if (tile.kind !== 'ore') continue;
      expect(tile.amount).toBe(20);
      expect(tile.regrowAt).toBeNull();
    }
  });

  it('empties the machines and cancels a running job', () => {
    const state = createInitialState();
    messUpTheFloor(state);

    resetWorld(state);

    for (const tile of state.grid.tiles) {
      if (tile.kind !== 'machine') continue;
      expect(tile.input).toEqual({});
      expect(tile.output).toEqual({});
      expect(tile.job).toBeNull();
    }
  });

  it('puts the tick counter back to zero', () => {
    const state = createInitialState();
    messUpTheFloor(state);

    resetWorld(state);

    expect(state.tick).toBe(0);
  });

  it('keeps everything the player earned', () => {
    const state = createInitialState();
    messUpTheFloor(state);

    resetWorld(state);

    expect(state.credits).toBe(1340);
    expect(state.unlocks).toContain('sell');
    expect(state.completedMissions).toContain('m1_move');
    // Missions count lifetime totals, so wiping stats would undo progress.
    expect(state.stats.oreMined).toBe(2);
  });

  it('keeps a bought grid upgrade and rebuilds it identically', () => {
    const state = createInitialState();
    state.grid = expandGrid(state.grid, 12, 20);
    const before = state.grid.tiles.map((tile) => tile.kind).join('');
    messUpTheFloor(state);

    resetWorld(state);

    expect(state.grid.width).toBe(12);
    expect(state.grid.height).toBe(12);
    expect(state.grid.tiles.map((tile) => tile.kind).join('')).toBe(before);
  });

  it('parks a second robot beside the first instead of on top of it', () => {
    const state = createInitialState();
    state.robots.push(createRobot('r2', 6, 6));

    resetWorld(state);

    const [first, second] = state.robots;
    expect(second!.x).not.toBe(first!.x);
    expect(second!.y).toBe(first!.y);
  });

  it('is idempotent', () => {
    const state = createInitialState();
    messUpTheFloor(state);

    resetWorld(state);
    const once = JSON.stringify(state);
    resetWorld(state);

    expect(JSON.stringify(state)).toBe(once);
  });
});

describe('reset() availability', () => {
  it('is callable from the very first script, like the readers', () => {
    const state = createInitialState();
    expect(unlockedCommands(state)).toContain('reset');
  });
});
