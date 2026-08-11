import { describe, expect, it } from 'vitest';
import type { GameState, Grid, GroundTile, ResourceId } from '../src/game/types';
import {
  BASE_YIELD,
  GROW_TICKS,
  isSeedable,
  neighbourBonus,
  purityFor,
  ripen,
  yieldFor,
} from '../src/game/cultivation';
import { setTile } from '../src/game/grid';
import { createInitialState } from '../src/game/GameState';

function ground(state: GroundTile['state'], resource: ResourceId | null = null): GroundTile {
  return { kind: 'ground', state, resource, ripeAt: null, yield: 0, purity: 0 };
}

function bareGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ground('raw')),
  };
}

describe('isSeedable', () => {
  it('accepts the two ores and nothing else', () => {
    expect(isSeedable('iron_ore')).toBe(true);
    expect(isSeedable('copper_ore')).toBe(true);
    expect(isSeedable('iron_ingot')).toBe(false);
    expect(isSeedable('seed_crystal')).toBe(false);
  });

  it('gives copper a longer season than iron', () => {
    expect(GROW_TICKS.copper_ore).toBeGreaterThan(GROW_TICKS.iron_ore ?? 0);
  });
});

describe('neighbourBonus', () => {
  it('counts only the four orthogonal neighbours growing the same crop', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('growing', 'iron_ore'));
    setTile(grid, 0, 1, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 1, ground('growing', 'copper_ore'));
    setTile(grid, 1, 2, ground('prepared', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(2);
  });

  it('does not count diagonals', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 0, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 2, ground('ripe', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(0);
  });

  it('treats the edge of the factory as no neighbour, not as an error', () => {
    const grid = bareGrid(1, 1);
    expect(neighbourBonus(grid, 0, 0, 'iron_ore')).toBe(0);
  });
});

describe('yieldFor', () => {
  it('pays the base yield on a lonely tile', () => {
    expect(yieldFor(bareGrid(3, 3), 1, 1, 'iron_ore')).toBe(BASE_YIELD);
  });

  it('pays one more per matching neighbour', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 1, 2, ground('ripe', 'iron_ore'));

    expect(yieldFor(grid, 1, 1, 'iron_ore')).toBe(BASE_YIELD + 2);
  });
});

describe('purityFor', () => {
  it('stays inside 1..10', () => {
    for (let tick = 0; tick < 50; tick += 1) {
      for (let x = 0; x < 8; x += 1) {
        const purity = purityFor(x, x + 1, tick);
        expect(purity).toBeGreaterThanOrEqual(1);
        expect(purity).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is deterministic in the tile and the moment', () => {
    expect(purityFor(3, 4, 12)).toBe(purityFor(3, 4, 12));
  });

  it('is not the same for every tile', () => {
    const values = new Set([purityFor(0, 0, 0), purityFor(1, 0, 0), purityFor(0, 1, 0)]);
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('ripen', () => {
  function stateWith(grid: Grid, tick: number): GameState {
    const state = createInitialState();
    state.grid = grid;
    state.tick = tick;
    return state;
  }

  it('ripens only crops whose tick has arrived', () => {
    const grid = bareGrid(2, 1);
    const early: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 10 };
    const late: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 40 };
    setTile(grid, 0, 0, early);
    setTile(grid, 1, 0, late);

    const ripened = ripen(stateWith(grid, 10));

    expect(ripened).toHaveLength(1);
    expect(early.state).toBe('ripe');
    expect(early.ripeAt).toBeNull();
    expect(late.state).toBe('growing');
  });

  it('leaves raw, prepared and already ripe ground alone', () => {
    const grid = bareGrid(3, 1);
    setTile(grid, 0, 0, ground('raw'));
    setTile(grid, 1, 0, ground('prepared'));
    setTile(grid, 2, 0, { ...ground('ripe', 'iron_ore'), yield: 3 });

    expect(ripen(stateWith(grid, 9999))).toHaveLength(0);
  });
});
