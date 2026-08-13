import { describe, expect, it } from 'vitest';
import { createInitialState, createRobot } from '../src/game/GameState';
import { setTile } from '../src/game/grid';
import {
  addBatch,
  maxPurityOnFloor,
  oreCount,
  takeOre,
  totalOre,
} from '../src/game/batches';
import type { GroundTile } from '../src/game/types';

function ripe(resource: 'iron_ore' | 'copper_ore', purity: number): GroundTile {
  return { kind: 'ground', state: 'ripe', resource, ripeAt: null, yield: 3, purity };
}

describe('addBatch and oreCount', () => {
  it('merges parcels of the same ore and purity', () => {
    const robot = createRobot('r1', 0, 0);
    addBatch(robot, 'iron_ore', 3, 8);
    addBatch(robot, 'iron_ore', 2, 8);
    addBatch(robot, 'iron_ore', 1, 4);

    expect(robot.batches).toHaveLength(2);
    expect(oreCount(robot, 'iron_ore')).toBe(6);
    expect(totalOre(robot)).toBe(6);
  });

  it('ignores a non-positive amount', () => {
    const robot = createRobot('r1', 0, 0);
    addBatch(robot, 'iron_ore', 0, 5);
    addBatch(robot, 'iron_ore', -3, 5);
    expect(robot.batches).toEqual([]);
  });
});

describe('takeOre', () => {
  it('draws from the lowest-purity parcels first', () => {
    const robot = createRobot('r1', 0, 0);
    addBatch(robot, 'iron_ore', 3, 9); // the good stuff
    addBatch(robot, 'iron_ore', 3, 2); // the dregs

    expect(takeOre(robot, 'iron_ore', 4)).toBe(true);

    // The 3 low-purity ones went first, then one off the high-purity parcel.
    expect(oreCount(robot, 'iron_ore')).toBe(2);
    expect(robot.batches).toEqual([{ resource: 'iron_ore', amount: 2, purity: 9 }]);
  });

  it('refuses and changes nothing when there is not enough', () => {
    const robot = createRobot('r1', 0, 0);
    addBatch(robot, 'iron_ore', 2, 5);

    expect(takeOre(robot, 'iron_ore', 3)).toBe(false);
    expect(oreCount(robot, 'iron_ore')).toBe(2);
  });
});

describe('maxPurityOnFloor', () => {
  it('finds the highest purity among ripe tiles', () => {
    const state = createInitialState();
    setTile(state.grid, 0, 0, ripe('iron_ore', 4));
    setTile(state.grid, 1, 0, ripe('iron_ore', 9));
    setTile(state.grid, 2, 0, ripe('copper_ore', 7));

    expect(maxPurityOnFloor(state)).toBe(9);
  });

  it('is null when nothing is ripe', () => {
    const state = createInitialState();
    for (const tile of state.grid.tiles) {
      if (tile.kind === 'ground') {
        tile.state = 'raw';
        tile.resource = null;
        tile.purity = 0;
      }
    }
    expect(maxPurityOnFloor(state)).toBeNull();
  });
});
