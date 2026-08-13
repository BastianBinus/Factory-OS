import type { GameState, Inventory } from './types';
import { RESOURCE_IDS, addItems, removeItems } from './resources';

/**
 * The economy has no money and no bank. What the player can spend is simply
 * everything the robots are carrying, added together — so an upgrade is bought
 * with the very metal the fleet just harvested.
 */

/** Every robot's inventory summed into one. The fleet's spendable wealth. */
export function totalResources(state: GameState): Inventory {
  const total: Inventory = {};
  for (const robot of state.robots) {
    for (const id of RESOURCE_IDS) {
      const amount = robot.inventory[id] ?? 0;
      if (amount > 0) addItems(total, id, amount);
    }
  }
  return total;
}

/** What the fleet is still short of `cost`, per resource. Empty means affordable. */
export function missingResources(state: GameState, cost: Inventory): Inventory {
  const have = totalResources(state);
  const missing: Inventory = {};
  for (const id of RESOURCE_IDS) {
    const short = (cost[id] ?? 0) - (have[id] ?? 0);
    if (short > 0) missing[id] = short;
  }
  return missing;
}

export function canAfford(state: GameState, cost: Inventory): boolean {
  const have = totalResources(state);
  return RESOURCE_IDS.every((id) => (cost[id] ?? 0) <= (have[id] ?? 0));
}

/**
 * Pays `cost` out of the fleet, drawing from each robot in turn until the bill
 * is met. Returns false and touches nothing if the fleet cannot cover it, so a
 * failed purchase never leaves a robot half-charged.
 */
export function spendResources(state: GameState, cost: Inventory): boolean {
  if (!canAfford(state, cost)) return false;
  for (const id of RESOURCE_IDS) {
    let owed = cost[id] ?? 0;
    for (const robot of state.robots) {
      if (owed <= 0) break;
      const take = Math.min(robot.inventory[id] ?? 0, owed);
      if (take > 0) {
        removeItems(robot.inventory, id, take);
        owed -= take;
      }
    }
  }
  return true;
}
