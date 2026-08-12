import type { GameState, Grid, GroundTile, ResourceId } from './types';
import { tileAt } from './grid';

/**
 * The ground state machine, with no idea that commands exist.
 *
 * It lives apart from commands.ts for one reason: the verbs are thin — they
 * check whose turn it is and hand over — while the rules about what a tile is
 * worth and when it ripens are the part worth testing on its own.
 */

/** What a lonely tile hands over when it is harvested. */
export const BASE_YIELD = 3;

/** Added per orthogonal neighbour growing the same crop. */
export const ADJACENCY_BONUS = 1;

/**
 * How long each crop takes. Being in this table is what makes a resource
 * seedable at all — ingots and gears are made, not grown.
 */
export const GROW_TICKS: Partial<Record<ResourceId, number>> = {
  iron_ore: 8,
  copper_ore: 12,
};

export function isSeedable(resource: ResourceId): boolean {
  return GROW_TICKS[resource] !== undefined;
}

/**
 * Neighbours growing the same crop, counted orthogonally.
 *
 * Diagonals deliberately do not count: it makes a solid block the best shape,
 * which is a rule a player can see on the floor and reason about in a loop.
 */
export function neighbourBonus(grid: Grid, x: number, y: number, resource: ResourceId): number {
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;

  let count = 0;
  for (const [dx, dy] of offsets) {
    const tile = tileAt(grid, x + dx, y + dy);
    if (!tile || tile.kind !== 'ground') continue;
    if (tile.state !== 'growing' && tile.state !== 'ripe') continue;
    if (tile.resource !== resource) continue;
    count += 1;
  }
  return count;
}

/** Decided once, when the tile is seeded — not when it is harvested. */
export function yieldFor(grid: Grid, x: number, y: number, resource: ResourceId): number {
  return BASE_YIELD + ADJACENCY_BONUS * neighbourBonus(grid, x, y, resource);
}

/**
 * A grade from 1 to 10, deterministic in the tile and the tick it was seeded.
 *
 * Nothing in 10a reads it. It is written now so that the sorting bay in 10d,
 * which is the whole point of the mechanic, does not need its own migration.
 */
export function purityFor(x: number, y: number, tick: number): number {
  return 1 + ((x * 7 + y * 13 + tick * 31) % 10);
}

/** The one thing the world does on its own each tick. Returns what changed. */
export function ripen(state: GameState): GroundTile[] {
  const ripened: GroundTile[] = [];

  for (const tile of state.grid.tiles) {
    if (tile.kind !== 'ground' || tile.state !== 'growing') continue;
    if (tile.ripeAt === null || state.tick < tile.ripeAt) continue;
    tile.state = 'ripe';
    tile.ripeAt = null;
    ripened.push(tile);
  }

  return ripened;
}
