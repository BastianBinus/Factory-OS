import { describe, expect, it } from 'vitest';
import type { GameState, Inventory } from '../src/game/types';
import { createInitialState, createRobot } from '../src/game/GameState';
import { canAfford, missingResources, spendResources, totalResources } from '../src/game/economy';

/** A state whose fleet carries exactly the given inventories, one robot each. */
function fleet(...inventories: Inventory[]): GameState {
  const state = createInitialState();
  state.robots = inventories.map((inventory, index) => ({
    ...createRobot(`r${index + 1}`, index, 0),
    inventory: { ...inventory },
  }));
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
    expect(state.robots[0]?.inventory['iron_ore'] ?? 0).toBe(0);
    expect(state.robots[1]?.inventory['iron_ore']).toBe(2);
  });

  it('refuses when the fleet is short and touches nothing', () => {
    const state = fleet({ iron_ore: 5 });

    expect(spendResources(state, { iron_ore: 6 })).toBe(false);
    expect(totalResources(state)).toEqual({ iron_ore: 5 });
  });
});
