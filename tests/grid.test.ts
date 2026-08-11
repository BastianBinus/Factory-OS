import { describe, expect, it } from 'vitest';
import type { Grid, OreTile } from '../src/game/types';
import {
  DIRECTION_VECTORS,
  expandGrid,
  forEachTile,
  inBounds,
  indexOf,
  isDirection,
  regrowOre,
  setTile,
  step,
  tileAt,
} from '../src/game/grid';

function emptyGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({
      kind: 'ground' as const,
      state: 'raw' as const,
      resource: null,
      ripeAt: null,
      yield: 0,
      purity: 0,
    })),
  };
}

describe('directions', () => {
  it('points north at the top of the screen', () => {
    expect(DIRECTION_VECTORS.north).toEqual({ dx: 0, dy: -1 });
    expect(DIRECTION_VECTORS.south).toEqual({ dx: 0, dy: 1 });
  });

  it('rejects anything that is not one of the four names', () => {
    expect(isDirection('north')).toBe(true);
    expect(isDirection('up')).toBe(false);
    expect(isDirection(0)).toBe(false);
    expect(isDirection(undefined)).toBe(false);
  });

  it('steps by exactly one tile', () => {
    expect(step(3, 3, 'east')).toEqual({ x: 4, y: 3 });
    expect(step(3, 3, 'north')).toEqual({ x: 3, y: 2 });
  });
});

describe('bounds and indexing', () => {
  const grid = emptyGrid(4, 3);

  it('treats the edges as walls', () => {
    expect(inBounds(grid, 0, 0)).toBe(true);
    expect(inBounds(grid, 3, 2)).toBe(true);
    expect(inBounds(grid, 4, 2)).toBe(false);
    expect(inBounds(grid, -1, 0)).toBe(false);
  });

  it('rejects fractional coordinates', () => {
    expect(inBounds(grid, 1.5, 1)).toBe(false);
  });

  it('indexes row-major', () => {
    expect(indexOf(grid, 2, 1)).toBe(6);
  });

  it('returns undefined outside the grid instead of throwing', () => {
    expect(tileAt(grid, 99, 99)).toBeUndefined();
  });

  it('visits every tile once', () => {
    const seen: string[] = [];
    forEachTile(grid, (_tile, x, y) => seen.push(`${x},${y}`));
    expect(seen).toHaveLength(12);
    expect(seen[0]).toBe('0,0');
    expect(seen[11]).toBe('3,2');
  });
});

describe('ore regrowth', () => {
  it('refills only nodes whose regrow tick has arrived', () => {
    const grid = emptyGrid(2, 1);
    const early: OreTile = { kind: 'ore', resource: 'iron_ore', amount: 0, regrowAt: 10 };
    const late: OreTile = { kind: 'ore', resource: 'iron_ore', amount: 0, regrowAt: 40 };
    setTile(grid, 0, 0, early);
    setTile(grid, 1, 0, late);

    const regrown = regrowOre(grid, 10, 20);

    expect(regrown).toHaveLength(1);
    expect(early.amount).toBe(20);
    expect(early.regrowAt).toBeNull();
    expect(late.amount).toBe(0);
  });

  it('leaves nodes that still hold ore alone', () => {
    const grid = emptyGrid(1, 1);
    const tile: OreTile = { kind: 'ore', resource: 'iron_ore', amount: 5, regrowAt: null };
    setTile(grid, 0, 0, tile);

    expect(regrowOre(grid, 999, 20)).toHaveLength(0);
    expect(tile.amount).toBe(5);
  });
});

describe('expandGrid', () => {
  it('keeps every existing tile at its old coordinates', () => {
    const grid = emptyGrid(4, 4);
    const market = { kind: 'market' as const };
    setTile(grid, 0, 0, market);
    setTile(grid, 3, 3, {
      kind: 'ground',
      state: 'ripe',
      resource: 'copper_ore',
      ripeAt: null,
      yield: 7,
      purity: 2,
    });

    const bigger = expandGrid(grid, 8);

    expect(bigger.width).toBe(8);
    expect(bigger.height).toBe(8);
    expect(bigger.tiles).toHaveLength(64);
    expect(tileAt(bigger, 0, 0)).toBe(market);
    expect(tileAt(bigger, 3, 3)).toMatchObject({ kind: 'ground', state: 'ripe', yield: 7 });
  });

  // Land is space to plant in, not a pile of free resources.
  it('fills the new land with raw ground and nothing else', () => {
    const bigger = expandGrid(emptyGrid(4, 4), 12);

    expect(bigger.tiles).toHaveLength(144);
    expect(
      bigger.tiles.every((tile) => tile.kind === 'ground' && tile.state === 'raw'),
    ).toBe(true);
  });

  it('returns the same grid when the target size is not bigger', () => {
    const grid = emptyGrid(8, 8);
    expect(expandGrid(grid, 8)).toBe(grid);
  });
});
