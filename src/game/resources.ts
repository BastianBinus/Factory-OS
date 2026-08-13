import type { Inventory, OreId, ResourceDef, ResourceId } from './types';

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  iron_ore: { id: 'iron_ore', label: 'Iron ore', colorToken: 'w-ore-iron' },
  copper_ore: { id: 'copper_ore', label: 'Copper ore', colorToken: 'w-ore-copper' },
  iron_ingot: { id: 'iron_ingot', label: 'Iron ingot', colorToken: 'w-ingot-iron' },
  copper_ingot: { id: 'copper_ingot', label: 'Copper ingot', colorToken: 'w-ingot-copper' },
  gear: { id: 'gear', label: 'Gear', colorToken: 'w-gear' },
  seed_crystal: { id: 'seed_crystal', label: 'Seed crystal', colorToken: 'w-seed-crystal' },
  refined_ingot: { id: 'refined_ingot', label: 'Refined ingot', colorToken: 'w-metal' },
  component: { id: 'component', label: 'Component', colorToken: 'w-gear' },
};

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

/** The raw ores, carried as purity-bearing batches rather than bare counts. */
export const ORE_IDS: OreId[] = ['iron_ore', 'copper_ore'];

export function isResourceId(value: unknown): value is ResourceId {
  return typeof value === 'string' && value in RESOURCES;
}

export function isOre(value: unknown): value is OreId {
  return value === 'iron_ore' || value === 'copper_ore';
}

export function countOf(inventory: Inventory, resource: ResourceId): number {
  return inventory[resource] ?? 0;
}

export function totalItems(inventory: Inventory): number {
  let total = 0;
  for (const id of RESOURCE_IDS) total += inventory[id] ?? 0;
  return total;
}

export function isEmpty(inventory: Inventory): boolean {
  return totalItems(inventory) === 0;
}

/** Mutates in place. Zero-valued keys are dropped so saves stay small and comparable. */
export function addItems(inventory: Inventory, resource: ResourceId, amount: number): void {
  const next = (inventory[resource] ?? 0) + amount;
  if (next <= 0) delete inventory[resource];
  else inventory[resource] = next;
}

export function removeItems(inventory: Inventory, resource: ResourceId, amount: number): boolean {
  if ((inventory[resource] ?? 0) < amount) return false;
  addItems(inventory, resource, -amount);
  return true;
}

export function hasAll(inventory: Inventory, required: Inventory): boolean {
  for (const id of RESOURCE_IDS) {
    const need = required[id] ?? 0;
    if (need > 0 && (inventory[id] ?? 0) < need) return false;
  }
  return true;
}

export function mergeInto(target: Inventory, source: Inventory): void {
  for (const id of RESOURCE_IDS) {
    const amount = source[id] ?? 0;
    if (amount > 0) addItems(target, id, amount);
  }
}

export function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

/** Stable, readable form for logs and the console: "3 iron ore, 1 gear". */
export function describeInventory(inventory: Inventory): string {
  const parts = RESOURCE_IDS.filter((id) => (inventory[id] ?? 0) > 0).map(
    (id) => `${inventory[id] ?? 0} ${RESOURCES[id].label.toLowerCase()}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}
