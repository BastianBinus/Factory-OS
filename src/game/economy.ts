import type { GameState, Inventory, ResourceId } from './types';
import { RESOURCES, RESOURCE_IDS, cloneInventory, totalItems } from './resources';

export function sellPrice(resource: ResourceId): number {
  return RESOURCES[resource].sellPrice;
}

export function valueOf(inventory: Inventory): number {
  let value = 0;
  for (const id of RESOURCE_IDS) value += (inventory[id] ?? 0) * sellPrice(id);
  return value;
}

export interface SaleResult {
  credits: number;
  items: number;
  sold: Inventory;
}

/**
 * Sells everything the robot carries. Credits earned is tracked separately from
 * the balance because missions ask "how much have you earned", not "how much do
 * you have left after shopping".
 */
export function sellAll(state: GameState, inventory: Inventory): SaleResult {
  const sold = cloneInventory(inventory);
  const items = totalItems(sold);
  const credits = valueOf(sold);

  for (const id of RESOURCE_IDS) delete inventory[id];

  state.credits += credits;
  state.stats.creditsEarned += credits;
  state.stats.itemsSold += items;

  return { credits, items, sold };
}

export function canAfford(state: GameState, cost: number): boolean {
  return state.credits >= cost;
}

export function spend(state: GameState, cost: number): boolean {
  if (!canAfford(state, cost)) return false;
  state.credits -= cost;
  return true;
}
