import { describe, expect, it } from 'vitest';
import type { GameState, Inventory } from '../src/game/types';
import { createInitialState, createRobot } from '../src/game/GameState';
import { BASE_PURITY, addBatch, oreCount } from '../src/game/batches';
import { canAfford, missingResources, spendResources, totalResources } from '../src/game/economy';
import { isOre } from '../src/game/resources';

/**
 * A state whose fleet carries exactly the given inventories, one robot each.
 * Ore is routed into batches (at the neutral purity) since that is where it lives.
 */
function fleet(...inventories: Inventory[]): GameState {
  const state = createInitialState();
  state.robots = inventories.map((inventory, index) => {
    const robot = createRobot(`r${index + 1}`, index, 0);
    for (const [id, amount] of Object.entries(inventory)) {
      if (isOre(id)) addBatch(robot, id, amount ?? 0, BASE_PURITY);
      else robot.inventory[id as keyof Inventory] = amount;
    }
    return robot;
  });
  return state;
}

describe('totalResources', () => {
  it('sums every robot inventory into one', () => {
    const state = fleet({ iron_ore: 3 }, { iron_ore: 2, gear: 1 });
    expect(totalResources(state)).toEqual({ iron_ore: 5, gear: 1 });
  });
});

describe('canAfford and missingResources', () => {
  it('affords a cost the fleet covers exactly', () => {
    const state = fleet({ iron_ingot: 10 });
    expect(canAfford(state, { iron_ingot: 10 })).toBe(true);
    expect(missingResources(state, { iron_ingot: 10 })).toEqual({});
  });

  it('reports the shortfall on each resource that is short', () => {
    const state = fleet({ iron_ingot: 4, gear: 1 });
    expect(canAfford(state, { iron_ingot: 10, gear: 3 })).toBe(false);
    expect(missingResources(state, { iron_ingot: 10, gear: 3 })).toEqual({ iron_ingot: 6, gear: 2 });
  });
});

describe('spendResources', () => {
  it('draws across robots in turn until the bill is met', () => {
    const state = fleet({ iron_ore: 4 }, { iron_ore: 4 });

    expect(spendResources(state, { iron_ore: 6 })).toBe(true);
    expect(totalResources(state)).toEqual({ iron_ore: 2 });
    // The first robot is drained before the second is touched.
    expect(oreCount(state.robots[0]!, 'iron_ore')).toBe(0);
    expect(oreCount(state.robots[1]!, 'iron_ore')).toBe(2);
  });

  it('refuses when the fleet is short and touches nothing', () => {
    const state = fleet({ iron_ore: 5 });

    expect(spendResources(state, { iron_ore: 6 })).toBe(false);
    expect(totalResources(state)).toEqual({ iron_ore: 5 });
  });
});
