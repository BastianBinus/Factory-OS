import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/GameState';
import { canAfford, sellAll, sellPrice, spend, valueOf } from '../src/game/economy';

describe('prices', () => {
  it('values a mixed inventory', () => {
    expect(valueOf({ iron_ore: 3, gear: 2 })).toBe(3 * 3 + 2 * 40);
  });

  it('values an empty inventory at zero', () => {
    expect(valueOf({})).toBe(0);
  });

  it('pays more for processed goods', () => {
    expect(sellPrice('iron_ingot')).toBeGreaterThan(sellPrice('iron_ore'));
    expect(sellPrice('gear')).toBeGreaterThan(sellPrice('iron_ingot'));
  });
});

describe('sellAll', () => {
  it('empties the inventory and pays for it', () => {
    const state = createInitialState();
    const inventory = { iron_ore: 4, copper_ingot: 1 };

    const sale = sellAll(state, inventory);

    expect(sale.credits).toBe(4 * 3 + 11);
    expect(sale.items).toBe(5);
    expect(sale.sold).toEqual({ iron_ore: 4, copper_ingot: 1 });
    expect(inventory).toEqual({});
    expect(state.credits).toBe(sale.credits);
    expect(state.stats.itemsSold).toBe(5);
  });

  it('tracks credits earned separately from the balance', () => {
    const state = createInitialState();
    sellAll(state, { gear: 1 });
    spend(state, 30);

    expect(state.credits).toBe(10);
    expect(state.stats.creditsEarned).toBe(40);
  });

  it('handles selling nothing without touching the balance', () => {
    const state = createInitialState();
    state.credits = 50;

    const sale = sellAll(state, {});

    expect(sale.credits).toBe(0);
    expect(state.credits).toBe(50);
  });
});

describe('spending', () => {
  it('refuses to go into debt', () => {
    const state = createInitialState();
    state.credits = 99;

    expect(canAfford(state, 100)).toBe(false);
    expect(spend(state, 100)).toBe(false);
    expect(state.credits).toBe(99);
  });

  it('allows spending the last credit', () => {
    const state = createInitialState();
    state.credits = 100;

    expect(spend(state, 100)).toBe(true);
    expect(state.credits).toBe(0);
  });
});
