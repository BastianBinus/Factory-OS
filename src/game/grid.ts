import type { Direction, Grid, Tile } from './types';

/**
 * Coordinates: x grows east, y grows south. North therefore decreases y, which
 * keeps "north" in a script pointing at the top of the screen — the camera angle
 * is fixed for exactly this reason.
 */
export const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

export const DIRECTION_VECTORS: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as string[]).includes(value);
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function indexOf(grid: Grid, x: number, y: number): number {
  return y * grid.width + x;
}

export function tileAt(grid: Grid, x: number, y: number): Tile | undefined {
  if (!inBounds(grid, x, y)) return undefined;
  return grid.tiles[indexOf(grid, x, y)];
}

export function setTile(grid: Grid, x: number, y: number, tile: Tile): void {
  if (!inBounds(grid, x, y)) return;
  grid.tiles[indexOf(grid, x, y)] = tile;
}

export function step(x: number, y: number, direction: Direction): { x: number; y: number } {
  const vector = DIRECTION_VECTORS[direction];
  return { x: x + vector.dx, y: y + vector.dy };
}

export function forEachTile(grid: Grid, visit: (tile: Tile, x: number, y: number) => void): void {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const tile = grid.tiles[indexOf(grid, x, y)];
      if (tile) visit(tile, x, y);
    }
  }
}

/**
 * Grows the factory floor to the south-east, keeping every existing tile at its
 * old coordinates so running scripts do not break.
 *
 * New land is raw ground and nothing else. Scattering free resources across it
 * would make buying land the reward, when the reward is meant to be the space to
 * plant more — which still has to be cleared, seeded and waited for.
 */
export function expandGrid(grid: Grid, size: number): Grid {
  if (size <= grid.width && size <= grid.height) return grid;

  const width = Math.max(size, grid.width);
  const height = Math.max(size, grid.height);
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const existing = tileAt(grid, x, y);
      tiles.push(
        existing ?? { kind: 'ground', state: 'raw', resource: null, ripeAt: null, yield: 0, purity: 0 },
      );
    }
  }

  return { width, height, tiles };
}
