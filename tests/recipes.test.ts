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

  it('is worth crafting — output sells for more than the inputs', () => {
    for (const recipe of RECIPES) {
      const inputValue = Object.entries(recipe.inputs).reduce(
        (sum, [id, amount]) => sum + RESOURCES[id as keyof typeof RESOURCES].sellPrice * amount,
        0,
      );
      const outputValue = RESOURCES[recipe.output].sellPrice * recipe.outputAmount;
      expect(outputValue).toBeGreaterThan(inputValue);
    }
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
