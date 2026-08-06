import type { Direction, Grid, OreTile, Tile } from './types';

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

/** Ore nodes refill on their own so a factory can run unattended forever. */
export function regrowOre(grid: Grid, tick: number, amount: number): OreTile[] {
  const regrown: OreTile[] = [];
  for (const tile of grid.tiles) {
    if (tile.kind !== 'ore') continue;
    if (tile.regrowAt === null || tick < tile.regrowAt) continue;
    tile.amount = amount;
    tile.regrowAt = null;
    regrown.push(tile);
  }
  return regrown;
}

/** Deterministic PRNG so an expanded grid looks the same on every machine and in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Grows the factory floor to the south-east, keeping every existing tile at its
 * old coordinates so running scripts do not break. New ground gets a scattering
 * of ore nodes.
 */
export function expandGrid(grid: Grid, size: number, oreAmount: number): Grid {
  if (size <= grid.width && size <= grid.height) return grid;

  const width = Math.max(size, grid.width);
  const height = Math.max(size, grid.height);
  const random = mulberry32(width * 1000 + height);
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const existing = tileAt(grid, x, y);
      if (existing) {
        tiles.push(existing);
        continue;
      }
      if (random() < 0.09) {
        tiles.push({
          kind: 'ore',
          resource: random() < 0.6 ? 'iron_ore' : 'copper_ore',
          amount: oreAmount,
          regrowAt: null,
        });
      } else {
        tiles.push({ kind: 'floor' });
      }
    }
  }

  return { width, height, tiles };
}
