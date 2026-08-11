import { describe, expect, it } from 'vitest';
import { RECIPES, findRunnableRecipe, getRecipe, recipesFor } from '../src/game/recipes';
import { RESOURCES, isResourceId } from '../src/game/resources';

describe('recipe table', () => {
  it('has a unique id per recipe', () => {
    const ids = RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references resources that exist', () => {
    for (const recipe of RECIPES) {
      expect(isResourceId(recipe.output)).toBe(true);
      for (const id of Object.keys(recipe.inputs)) {
        expect(isResourceId(id)).toBe(true);
      }
    }
  });

  function inputValueOf(recipe: (typeof RECIPES)[number]): number {
    return Object.entries(recipe.inputs).reduce(
      (sum, [id, amount]) => sum + RESOURCES[id as keyof typeof RESOURCES].sellPrice * amount,
      0,
    );
  }

  it('is worth crafting — output sells for more than the inputs', () => {
    for (const recipe of RECIPES) {
      // The seed crystal is the one thing here that is made to be used, not
      // sold, so it is held to the weaker rule in the next test instead.
      if (recipe.output === 'seed_crystal') continue;
      const outputValue = RESOURCES[recipe.output].sellPrice * recipe.outputAmount;
      expect(outputValue, recipe.id).toBeGreaterThan(inputValueOf(recipe));
    }
  });

  it('prices the seed crystal at exactly what it cost to make', () => {
    const recipe = getRecipe('craft_seed_crystal');
    expect(recipe).toBeDefined();
    // Not a profit and not a trap: a player who crafts a crystal and changes
    // their mind gets their ore back at face value.
    expect(RESOURCES.seed_crystal.sellPrice * recipe!.outputAmount).toBe(inputValueOf(recipe!));
  });

  it('costs time', () => {
    for (const recipe of RECIPES) expect(recipe.ticks).toBeGreaterThan(0);
  });
});

describe('lookup', () => {
  it('finds a recipe by id', () => {
    expect(getRecipe('assemble_gear')?.output).toBe('gear');
    expect(getRecipe('nope')).toBeUndefined();
  });

  it('groups recipes by machine', () => {
    expect(recipesFor('smelter').map((recipe) => recipe.id)).toEqual([
      'smelt_iron',
      'smelt_copper',
    ]);
    expect(recipesFor('assembler')).toHaveLength(1);
  });
});

describe('findRunnableRecipe', () => {
  it('returns nothing when the machine is empty', () => {
    expect(findRunnableRecipe('smelter', {})).toBeUndefined();
  });

  it('ignores inputs the machine cannot use', () => {
    expect(findRunnableRecipe('smelter', { gear: 5 })).toBeUndefined();
  });

  it('picks the first recipe whose inputs are covered', () => {
    expect(findRunnableRecipe('smelter', { copper_ore: 2 })?.id).toBe('smelt_copper');
    expect(findRunnableRecipe('smelter', { iron_ore: 1, copper_ore: 1 })?.id).toBe('smelt_iron');
  });

  it('needs the full amount, not just one of each', () => {
    expect(findRunnableRecipe('assembler', { iron_ingot: 1, copper_ingot: 1 })).toBeUndefined();
    expect(findRunnableRecipe('assembler', { iron_ingot: 2, copper_ingot: 1 })?.id).toBe(
      'assemble_gear',
    );
  });
});

describe('the seeder', () => {
  it('turns two iron ore into one seed crystal', () => {
    const recipe = getRecipe('craft_seed_crystal');
    expect(recipe).toMatchObject({
      machine: 'seeder',
      inputs: { iron_ore: 2 },
      output: 'seed_crystal',
      outputAmount: 1,
    });
  });

  it('is the only thing the seeder makes', () => {
    expect(recipesFor('seeder').map((recipe) => recipe.id)).toEqual(['craft_seed_crystal']);
  });

  it('runs on ore alone, so a field can be grown without the smelter', () => {
    expect(findRunnableRecipe('seeder', { iron_ore: 2 })?.id).toBe('craft_seed_crystal');
    expect(findRunnableRecipe('seeder', { iron_ore: 1 })).toBeUndefined();
  });
});
