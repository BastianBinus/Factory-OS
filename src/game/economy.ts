import type { GameState, Inventory } from './types';
import { RESOURCE_IDS, addItems, isOre, removeItems } from './resources';
import { oreCount, oreTotals, takeOre } from './batches';

/**
 * The economy has no money and no bank. What the player can spend is simply
 * everything the robots are carrying, added together — so an upgrade is bought
 * with the very metal the fleet just harvested.
 *
 * Ore lives in batches rather than the count inventory, so it is folded back in
 * here; everything else is a plain count.
 */

/** Every robot's inventory and ore batches summed into one. The fleet's wealth. */
export function totalResources(state: GameState): Inventory {
  const total: Inventory = {};
  for (const robot of state.robots) {
    for (const id of RESOURCE_IDS) {
      const amount = robot.inventory[id] ?? 0;
      if (amount > 0) addItems(total, id, amount);
    }
    const ore = oreTotals(robot);
    addItems(total, 'iron_ore', ore.iron_ore);
    addItems(total, 'copper_ore', ore.copper_ore);
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
 * is met. Ore comes out of batches lowest-purity-first (so a saved high-purity
 * batch is never spent by accident); everything else out of the count inventory.
 * Returns false and touches nothing if the fleet cannot cover it.
 */
export function spendResources(state: GameState, cost: Inventory): boolean {
  if (!canAfford(state, cost)) return false;
  for (const id of RESOURCE_IDS) {
    let owed = cost[id] ?? 0;
    if (owed <= 0) continue;
    for (const robot of state.robots) {
      if (owed <= 0) break;
      if (isOre(id)) {
        const take = Math.min(oreCount(robot, id), owed);
        if (take > 0 && takeOre(robot, id, take)) owed -= take;
      } else {
        const take = Math.min(robot.inventory[id] ?? 0, owed);
        if (take > 0) {
          removeItems(robot.inventory, id, take);
          owed -= take;
        }
      }
    }
  }
  return true;
}
