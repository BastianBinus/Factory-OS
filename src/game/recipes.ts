import type { Inventory, MachineId, Recipe } from './types';
import { hasAll } from './resources';

/**
 * The entire production chain lives here. Adding a tier later is a new row in
 * this table plus a machine on the grid — no engine change.
 */
export const RECIPES: Recipe[] = [
  {
    id: 'smelt_iron',
    machine: 'smelter',
    inputs: { iron_ore: 1 },
    output: 'iron_ingot',
    outputAmount: 1,
    ticks: 4,
  },
  {
    id: 'smelt_copper',
    machine: 'smelter',
    inputs: { copper_ore: 1 },
    output: 'copper_ingot',
    outputAmount: 1,
    ticks: 4,
  },
  {
    id: 'assemble_gear',
    machine: 'assembler',
    inputs: { iron_ingot: 2, copper_ingot: 1 },
    output: 'gear',
    outputAmount: 1,
    ticks: 8,
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}

export function recipesFor(machine: MachineId): Recipe[] {
  return RECIPES.filter((recipe) => recipe.machine === machine);
}

/**
 * First recipe whose inputs are fully covered. Order in RECIPES is therefore
 * the priority order — smelting iron wins over copper when both are loaded.
 */
export function findRunnableRecipe(machine: MachineId, input: Inventory): Recipe | undefined {
  return recipesFor(machine).find((recipe) => hasAll(input, recipe.inputs));
}
