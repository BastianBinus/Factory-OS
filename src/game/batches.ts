import type { Batch, GameState, OreId, Robot } from './types';
import { ORE_IDS } from './resources';

/**
 * Ore, and the purity it carries.
 *
 * The rest of the game counts resources; ore is the exception, because the
 * refinery and the press judge it by the purity of the tile it came from. So ore
 * is carried as a list of `Batch` parcels instead of a bare number, and these
 * helpers are the only place that list is read or changed.
 *
 * Parcels of the same ore and the same purity are merged, so the list stays
 * short and two robots that mined the same tiles compare equal.
 */

/** The purity a batch is stamped with when the game has no tile to inherit from. */
export const BASE_PURITY = 5;

/** How much ore of one kind the robot holds, across every purity. */
export function oreCount(robot: Robot, resource: OreId): number {
  let total = 0;
  for (const batch of robot.batches) if (batch.resource === resource) total += batch.amount;
  return total;
}

/** Every ore the robot holds, of any kind. */
export function totalOre(robot: Robot): number {
  let total = 0;
  for (const batch of robot.batches) total += batch.amount;
  return total;
}

/** Adds ore, merging into the parcel of the same kind and purity when one exists. */
export function addBatch(robot: Robot, resource: OreId, amount: number, purity: number): void {
  if (amount <= 0) return;
  const existing = robot.batches.find(
    (batch) => batch.resource === resource && batch.purity === purity,
  );
  if (existing) existing.amount += amount;
  else robot.batches.push({ resource, amount, purity });
}

/**
 * Removes `amount` of one ore, drawing from the lowest-purity parcels first.
 *
 * Spending the worst ore first is deliberate: it means a player who is saving a
 * high-purity batch for the refinery does not lose it to a smelter or a trade by
 * accident. Returns false and changes nothing if there is not enough.
 */
export function takeOre(robot: Robot, resource: OreId, amount: number): boolean {
  if (oreCount(robot, resource) < amount) return false;

  const parcels = robot.batches
    .filter((batch) => batch.resource === resource)
    .sort((a, b) => a.purity - b.purity);

  let owed = amount;
  for (const parcel of parcels) {
    if (owed <= 0) break;
    const take = Math.min(parcel.amount, owed);
    parcel.amount -= take;
    owed -= take;
  }

  robot.batches = robot.batches.filter((batch) => batch.amount > 0);
  return true;
}

/** The highest purity ripe on the floor right now, or null when nothing is ripe. */
export function maxPurityOnFloor(state: GameState): number | null {
  let max: number | null = null;
  for (const tile of state.grid.tiles) {
    if (tile.kind !== 'ground' || tile.state !== 'ripe' || tile.resource === null) continue;
    if (max === null || tile.purity > max) max = tile.purity;
  }
  return max;
}

/** Ore totals as a plain inventory-shaped record, for the economy helpers. */
export function oreTotals(robot: Robot): Record<OreId, number> {
  const totals = { iron_ore: 0, copper_ore: 0 };
  for (const batch of robot.batches) totals[batch.resource] += batch.amount;
  return totals;
}

/** Stable, readable form for logs: "3 iron ore (purity 8), 2 copper ore (purity 4)". */
export function describeBatches(batches: Batch[]): string {
  if (batches.length === 0) return 'no ore';
  const label: Record<OreId, string> = { iron_ore: 'iron ore', copper_ore: 'copper ore' };
  return batches
    .map((batch) => `${batch.amount} ${label[batch.resource]} (purity ${batch.purity})`)
    .join(', ');
}

/** True when the robot carries no ore at all. Used with inventory emptiness checks. */
export function hasNoOre(robot: Robot): boolean {
  return robot.batches.length === 0;
}

/** The ore kinds present, for iterating without touching every ResourceId. */
export { ORE_IDS };
