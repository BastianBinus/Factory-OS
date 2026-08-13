import type {
  Batch,
  CommandErrorCode,
  CommandResult,
  Direction,
  GameState,
  GroundTile,
  Inventory,
  MachineTile,
  OreId,
  Robot,
  Tile,
} from '../game/types';
import { PRESS_SLOTS } from '../game/types';
import { inBounds, isDirection, step, tileAt } from '../game/grid';
import {
  RESOURCES,
  RESOURCE_IDS,
  addItems,
  cloneInventory,
  describeInventory,
  isEmpty,
  isOre,
  isResourceId,
  removeItems,
  totalItems,
} from '../game/resources';
import { findRunnableRecipe, getRecipe, recipesFor } from '../game/recipes';
import {
  BASE_PURITY,
  addBatch,
  hasNoOre,
  maxPurityOnFloor,
  oreCount,
  takeBestBatch,
  takeOre,
  totalOre,
} from '../game/batches';
import { count } from '../game/rates';
import { GROW_TICKS, isSeedable, purityFor, ripen, yieldFor } from '../game/cultivation';

/**
 * Every command costs exactly one tick and mutates `state` in place. They import
 * nothing from the DOM, three.js or the worker, which is what lets the whole
 * rule set be tested headlessly.
 *
 * Multi-tick waiting is built in the worker API by repeating a one-tick `wait`,
 * so the scheduler never has to model an action that spans ticks.
 */

export interface CommandContext {
  state: GameState;
  robot: Robot;
}

function ok(value: unknown, log?: string): CommandResult {
  return log === undefined ? { ok: true, value } : { ok: true, value, log };
}

function fail(code: CommandErrorCode, error: string): CommandResult {
  return { ok: false, code, error };
}

function currentTile(ctx: CommandContext): Tile | undefined {
  return tileAt(ctx.state.grid, ctx.robot.x, ctx.robot.y);
}

function freeCapacity(ctx: CommandContext): number {
  return ctx.state.inventoryCapacity - totalItems(ctx.robot.inventory) - totalOre(ctx.robot);
}

// Commands ------------------------------------------------------------------

export function move(ctx: CommandContext, direction: unknown): CommandResult {
  if (!isDirection(direction)) {
    return fail(
      'bad_argument',
      `move() needs one of 'north', 'east', 'south', 'west' — got ${JSON.stringify(direction)}.`,
    );
  }

  const target = step(ctx.robot.x, ctx.robot.y, direction);
  ctx.robot.facing = direction as Direction;

  if (!inBounds(ctx.state.grid, target.x, target.y)) {
    return fail('blocked', `The robot cannot move ${direction} — that is the edge of the factory.`);
  }
  if (tileAt(ctx.state.grid, target.x, target.y)?.kind === 'wall') {
    return fail('blocked', `A wall blocks the way ${direction}. The robot has to route around it.`);
  }

  ctx.robot.x = target.x;
  ctx.robot.y = target.y;
  ctx.state.stats.tilesMoved += 1;

  return ok(null, `moved ${direction} to ${target.x},${target.y}`);
}

export function clear(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'ground') {
    return fail('nothing_here', 'clear() only works on open ground.');
  }
  if (tile.state !== 'raw') {
    return fail('bad_argument', `This ground is already ${tile.state}.`);
  }

  tile.state = 'prepared';

  return ok(null, 'cleared the ground');
}

export function seed(ctx: CommandContext, resource: unknown): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'ground') {
    return fail('nothing_here', 'seed() only works on open ground.');
  }
  if (tile.state !== 'prepared') {
    return fail(
      'bad_argument',
      tile.state === 'raw'
        ? 'This ground has to be cleared before it can be seeded.'
        : `This ground is already ${tile.state}.`,
    );
  }
  if (!isResourceId(resource) || !isSeedable(resource)) {
    return fail(
      'bad_argument',
      `seed() needs 'iron_ore' or 'copper_ore' — got ${JSON.stringify(resource)}.`,
    );
  }
  if ((ctx.robot.inventory['seed_crystal'] ?? 0) < 1) {
    return fail(
      'missing_input',
      'The robot has no seed crystal. The seeder makes one from 2 iron ore.',
    );
  }

  removeItems(ctx.robot.inventory, 'seed_crystal', 1);

  tile.state = 'growing';
  tile.resource = resource;
  tile.ripeAt = ctx.state.tick + (GROW_TICKS[resource] ?? 0);
  // Both are settled now rather than at harvest, so a player can read a field
  // and know what it is worth before waiting for it.
  tile.yield = yieldFor(ctx.state.grid, ctx.robot.x, ctx.robot.y, resource);
  tile.purity = purityFor(ctx.robot.x, ctx.robot.y, ctx.state.tick);
  count(ctx.state, 'seed', 1);

  return ok(resource, `seeded ${resource}`);
}

export function mine(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);
  if (tile?.kind === 'ground') return harvest(ctx, tile);
  return fail('nothing_here', 'The robot is not standing on ground it can harvest.');
}

/**
 * A ripe tile is emptied in a single tick. That is the whole reward for planning
 * ahead: the waiting happened while the robot was somewhere else being useful,
 * and collecting it costs the same one tick as walking a step.
 *
 * The seed crystal that comes with it is what makes replanting the same tile
 * free. Growing the *field* still costs crystals, which have to be crafted.
 */
function harvest(ctx: CommandContext, tile: GroundTile): CommandResult {
  if (tile.state === 'growing') {
    const ticks = tile.ripeAt === null ? 0 : Math.max(0, tile.ripeAt - ctx.state.tick);
    return fail('not_ready', `This crop is still growing — ${ticks} ticks to go.`);
  }
  if (tile.state !== 'ripe' || tile.resource === null) {
    return fail(
      'nothing_here',
      'There is nothing to harvest here. Use clear() and then seed() to plant something.',
    );
  }

  const haul = tile.yield;
  if (freeCapacity(ctx) < haul + 1) {
    return fail(
      'inventory_full',
      `A harvest is ${haul} ${tile.resource} plus 1 seed crystal, and the robot has room for ${freeCapacity(ctx)}.`,
    );
  }

  const resource = tile.resource;
  // Ore leaves the ground as a batch stamped with the tile's purity; the crystal
  // is a plain count. The purity is what the refinery and press will judge later.
  addBatch(ctx.robot, resource as OreId, haul, tile.purity);
  addItems(ctx.robot.inventory, 'seed_crystal', 1);
  ctx.state.stats.oreMined += haul;
  count(ctx.state, 'mine', haul);

  const purity = tile.purity;
  tile.state = 'raw';
  tile.resource = null;
  tile.ripeAt = null;
  tile.yield = 0;
  tile.purity = 0;

  return ok(resource, `harvested ${haul} ${resource} (purity ${purity}) and 1 seed crystal`);
}

export function drop(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'machine') {
    return fail('nothing_here', 'There is no machine on this tile to drop into.');
  }
  if (isEmpty(ctx.robot.inventory) && hasNoOre(ctx.robot)) {
    return fail('inventory_empty', 'The robot is not carrying anything.');
  }

  const accepted = acceptedInputs(tile);
  const moved: Inventory = {};
  let dropped = 0;

  for (const id of RESOURCE_IDS) {
    if (!accepted.has(id)) continue;

    // Ore comes out of the batches (its purity is dropped here — a smelter does
    // not care; the refinery and press take it a different way). Everything else
    // is a plain count.
    const amount = isOre(id) ? oreCount(ctx.robot, id) : ctx.robot.inventory[id] ?? 0;
    if (amount <= 0) continue;

    if (isOre(id)) takeOre(ctx.robot, id, amount);
    else removeItems(ctx.robot.inventory, id, amount);
    addItems(tile.input, id, amount);
    addItems(moved, id, amount);
    dropped += amount;
  }

  if (dropped === 0) {
    const carried = describeInventory(ctx.robot.inventory);
    return fail('bad_argument', `The ${tile.machine} does not take ${carried}.`);
  }

  return ok(moved, `dropped ${describeInventory(moved)} into the ${tile.machine}`);
}

export function craft(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'machine') {
    return fail('nothing_here', 'There is no machine on this tile.');
  }
  if (tile.job !== null) {
    return fail('busy', `The ${tile.machine} is already running.`);
  }

  const recipe = findRunnableRecipe(tile.machine, tile.input);
  if (!recipe) {
    return fail(
      'missing_input',
      `The ${tile.machine} does not have the right materials. It holds ${describeInventory(tile.input)}.`,
    );
  }

  for (const id of RESOURCE_IDS) {
    const need = recipe.inputs[id] ?? 0;
    if (need > 0) removeItems(tile.input, id, need);
  }

  tile.job = { recipeId: recipe.id, readyAt: ctx.state.tick + recipe.ticks };

  return ok(recipe.id, `started ${recipe.id} (${recipe.ticks} ticks)`);
}

export function take(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'machine') {
    return fail('nothing_here', 'There is no machine on this tile.');
  }
  if (isEmpty(tile.output)) {
    return tile.job !== null
      ? fail('not_ready', `The ${tile.machine} is still working. It is ready at tick ${tile.job.readyAt}.`)
      : fail('inventory_empty', `The ${tile.machine} has nothing to collect.`);
  }

  const room = freeCapacity(ctx);
  if (room <= 0) {
    return fail('inventory_full', 'The robot cannot carry any more.');
  }

  const taken: Inventory = {};
  let left = room;

  for (const id of RESOURCE_IDS) {
    if (left <= 0) break;
    const available = tile.output[id] ?? 0;
    if (available <= 0) continue;
    const amount = Math.min(available, left);
    removeItems(tile.output, id, amount);
    addItems(ctx.robot.inventory, id, amount);
    addItems(taken, id, amount);
    left -= amount;
  }

  return ok(taken, `took ${describeInventory(taken)}`);
}

/**
 * The calibration bay. Feeds the robot's best ore batch into the refinery, which
 * accepts it only if its purity is the highest anywhere — nothing riper is still
 * on the floor. Feed a lesser batch and the refinery rejects it, and the batch is
 * destroyed. So the player has to scan the whole field, find the maximum, and
 * mine that tile before refining: the mechanic is a max over the grid.
 */
export function refine(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'machine' || tile.machine !== 'refinery') {
    return fail('nothing_here', 'The robot has to stand on the refinery to refine.');
  }

  const batch = takeBestBatch(ctx.robot);
  if (batch === null) {
    return fail('inventory_empty', 'The robot is carrying no ore to refine.');
  }

  const floorBest = maxPurityOnFloor(ctx.state) ?? 0;
  if (batch.purity < floorBest) {
    // Rejected, and gone: feeding the refinery anything but the best destroys it.
    return fail(
      'blocked',
      `The refinery rejected a purity-${batch.purity} batch and destroyed it — a purity-${floorBest} crop is still on the floor. Refine the ripest.`,
    );
  }

  addItems(ctx.robot.inventory, 'refined_ingot', batch.amount);
  return ok(
    batch.amount,
    `refined ${batch.amount} ore of purity ${batch.purity} into refined ingot`,
  );
}

/** A valid press slot index: a whole number in range. */
function isSlotIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PRESS_SLOTS;
}

/** The press tile the robot stands on, or null with a reason if it is not there. */
function pressAt(ctx: CommandContext): MachineTile | null {
  const tile = currentTile(ctx);
  if (!tile || tile.kind !== 'machine' || tile.machine !== 'press' || !tile.slots) return null;
  return tile;
}

/**
 * Loads the robot's next ore batch into the press's first empty slot.
 *
 * Batches land in the order they come off the robot, which is not sorted — that
 * is the point. The player fills the slots, then reorders them with swapSlots
 * until they climb by purity, and only then will press() fire.
 */
export function load(ctx: CommandContext): CommandResult {
  const tile = pressAt(ctx);
  if (!tile || !tile.slots) {
    return fail('nothing_here', 'The robot has to stand on the press to load it.');
  }

  const batch = ctx.robot.batches.shift();
  if (!batch) {
    return fail('inventory_empty', 'The robot is carrying no ore to load.');
  }

  const slot = tile.slots.findIndex((entry) => entry === null);
  if (slot === -1) {
    ctx.robot.batches.unshift(batch); // put it back; the press is full
    return fail('inventory_full', `All ${PRESS_SLOTS} press slots are full.`);
  }

  tile.slots[slot] = batch;
  return ok(slot, `loaded purity ${batch.purity} into slot ${slot}`);
}

export function swapSlots(ctx: CommandContext, i: unknown, j: unknown): CommandResult {
  const tile = pressAt(ctx);
  if (!tile || !tile.slots) {
    return fail('nothing_here', 'The robot has to stand on the press to reorder it.');
  }
  if (!isSlotIndex(i) || !isSlotIndex(j)) {
    return fail(
      'bad_argument',
      `swapSlots() needs two slot numbers 0..${PRESS_SLOTS - 1} — got (${JSON.stringify(i)}, ${JSON.stringify(j)}).`,
    );
  }

  const temp = tile.slots[i]!;
  tile.slots[i] = tile.slots[j]!;
  tile.slots[j] = temp;
  return ok(null, `swapped slots ${i} and ${j}`);
}

/**
 * Fires the press, but only when the loaded slots climb by purity from left to
 * right. Feed it an unsorted line and it refuses — so the player has to have
 * sorted the slots first, which is the whole tier: a sorting algorithm, made
 * mandatory. On success every slot is pressed into one component apiece.
 */
export function press(ctx: CommandContext): CommandResult {
  const tile = pressAt(ctx);
  if (!tile || !tile.slots) {
    return fail('nothing_here', 'The robot has to stand on the press to fire it.');
  }

  const loaded = tile.slots.filter((entry): entry is Batch => entry !== null);
  if (loaded.length < 2) {
    return fail('missing_input', 'The press needs at least two loaded slots to fire.');
  }

  for (let k = 1; k < loaded.length; k += 1) {
    if (loaded[k]!.purity < loaded[k - 1]!.purity) {
      return fail(
        'blocked',
        'The press is loaded out of order. Its slots have to climb by purity before it will fire.',
      );
    }
  }

  const made = loaded.length;
  addItems(ctx.robot.inventory, 'component', made);
  count(ctx.state, 'press', made);
  tile.slots = tile.slots.map(() => null);

  return ok(made, `pressed ${made} sorted slots into ${made} components`);
}

/**
 * The foundry pour. It casts an alloy only when every smelter around it is hot —
 * has finished a batch and is holding output — in the same tick, and there are at
 * least `order.need` of them. One cold smelter fails the pour and, because a
 * half-poured cast is scrap, empties every neighbouring smelter with it. So the
 * player has to fire the whole ring and time the pour: whole-floor simultaneity.
 */
export function pour(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);
  if (!tile || tile.kind !== 'machine' || tile.machine !== 'foundry') {
    return fail('nothing_here', 'The robot has to stand on the foundry to pour.');
  }

  const smelters: { tile: MachineTile; x: number; y: number }[] = [];
  for (const direction of ['north', 'east', 'south', 'west'] as const) {
    const at = step(ctx.robot.x, ctx.robot.y, direction);
    const neighbour = tileAt(ctx.state.grid, at.x, at.y);
    if (neighbour?.kind === 'machine' && neighbour.machine === 'smelter') {
      smelters.push({ tile: neighbour, x: at.x, y: at.y });
    }
  }

  const need = tile.order?.need ?? smelters.length;
  if (smelters.length < need) {
    return fail('missing_input', `The foundry needs ${need} smelters around it; it has ${smelters.length}.`);
  }

  const cold = smelters.find((entry) => isEmpty(entry.tile.output));
  if (cold) {
    // A failed pour is scrap: every smelter around it is emptied.
    for (const entry of smelters) entry.tile.output = {};
    return fail(
      'blocked',
      `The smelter at ${cold.x},${cold.y} was cold, so the pour failed and the cast was scrapped.`,
    );
  }

  // Every smelter is hot: consume one ingot from each and cast one alloy per smelter.
  for (const entry of smelters) {
    for (const id of RESOURCE_IDS) {
      if ((entry.tile.output[id] ?? 0) > 0) {
        removeItems(entry.tile.output, id, 1);
        break;
      }
    }
  }

  const cast = smelters.length;
  addItems(ctx.robot.inventory, 'alloy', cast);
  return ok(cast, `poured ${cast} alloy from ${cast} hot smelters`);
}

/** How many of `from` buy one of `to` at the market. */
export const TRADE_RATIO = 3;

export function trade(ctx: CommandContext, from: unknown, to: unknown): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'market') {
    return fail('nothing_here', 'The robot has to stand on the market tile to trade.');
  }
  // Trading is an ore-for-ore market: it exists so a resource you cannot reach is
  // never a hard dead end, and ore is the only thing carried in batches anyway.
  if (!isOre(from) || !isOre(to)) {
    return fail(
      'bad_argument',
      `trade() swaps one ore for another — got (${JSON.stringify(from)}, ${JSON.stringify(to)}).`,
    );
  }
  if (from === to) {
    return fail('bad_argument', 'trade() needs two different ores.');
  }

  const held = oreCount(ctx.robot, from);
  if (held < TRADE_RATIO) {
    return fail(
      'missing_input',
      `trade() turns ${TRADE_RATIO} ${RESOURCES[from].label.toLowerCase()} into 1 ${RESOURCES[to].label.toLowerCase()}, and the robot has ${held}.`,
    );
  }

  // Three in for one out only ever shrinks the load, so capacity never bites.
  // Traded ore has no tile behind it, so it comes out at the neutral purity.
  const out = Math.floor(held / TRADE_RATIO);
  takeOre(ctx.robot, from, out * TRADE_RATIO);
  addBatch(ctx.robot, to, out, BASE_PURITY);

  return ok(
    out,
    `traded ${out * TRADE_RATIO} ${RESOURCES[from].label.toLowerCase()} for ${out} ${RESOURCES[to].label.toLowerCase()}`,
  );
}

export function wait(): CommandResult {
  return ok(null);
}

export function scan(ctx: CommandContext): CommandResult {
  return ok(describeTile(ctx.state, ctx.robot.x, ctx.robot.y));
}

export function scanAt(ctx: CommandContext, x: unknown, y: unknown): CommandResult {
  if (typeof x !== 'number' || typeof y !== 'number') {
    return fail('bad_argument', `scanAt() needs two numbers — got (${JSON.stringify(x)}, ${JSON.stringify(y)}).`);
  }
  if (!inBounds(ctx.state.grid, x, y)) {
    return fail(
      'out_of_bounds',
      `There is no tile at ${x},${y}. The factory is ${ctx.state.grid.width} by ${ctx.state.grid.height}.`,
    );
  }
  return ok(describeTile(ctx.state, x, y));
}

// Helpers -------------------------------------------------------------------

/** Everything any recipe of this machine consumes — that is what drop() will hand over. */
function acceptedInputs(tile: MachineTile): Set<string> {
  const accepted = new Set<string>();
  for (const recipe of recipesFor(tile.machine)) {
    for (const id of RESOURCE_IDS) {
      if ((recipe.inputs[id] ?? 0) > 0) accepted.add(id);
    }
  }
  return accepted;
}

/** Plain JSON so the value a player gets from scan() is easy to log and destructure. */
export function describeTile(state: GameState, x: number, y: number): unknown {
  const tile = tileAt(state.grid, x, y);
  if (!tile) return { type: 'void', x, y };

  switch (tile.kind) {
    case 'ground':
      return {
        type: 'ground',
        x,
        y,
        state: tile.state,
        resource: tile.resource,
        ripeIn: tile.ripeAt === null ? 0 : Math.max(0, tile.ripeAt - state.tick),
        yield: tile.yield,
        purity: tile.purity,
      };
    case 'machine':
      return {
        type: 'machine',
        x,
        y,
        machine: tile.machine,
        input: cloneInventory(tile.input),
        output: cloneInventory(tile.output),
        busy: tile.job !== null,
        readyIn: tile.job ? Math.max(0, tile.job.readyAt - state.tick) : 0,
        // The press exposes its slots as purities (null for empty) so a script
        // can read them, compare, and sort with swapSlots.
        ...(tile.slots
          ? { slots: tile.slots.map((slot) => (slot === null ? null : slot.purity)) }
          : {}),
        // The foundry exposes its order — how many hot smelters a pour needs.
        ...(tile.order ? { order: { ...tile.order } } : {}),
      };
    case 'market':
      return { type: 'market', x, y };
    case 'wall':
      return { type: 'wall', x, y };
    default:
      return { type: 'unknown', x, y };
  }
}

/**
 * World simulation that runs once per tick, independent of what any robot does:
 * machines finish their jobs and crops that have had their time turn ripe.
 */
export function advanceWorld(state: GameState): void {
  for (const tile of state.grid.tiles) {
    if (tile.kind !== 'machine' || tile.job === null) continue;
    if (state.tick < tile.job.readyAt) continue;

    const recipe = getRecipe(tile.job.recipeId);
    if (recipe) {
      addItems(tile.output, recipe.output, recipe.outputAmount);
      addItems(state.stats.crafted, recipe.output, recipe.outputAmount);
      if (tile.machine === 'smelter') count(state, 'smelt', recipe.outputAmount);
      else if (tile.machine === 'assembler') count(state, 'assemble', recipe.outputAmount);
    }
    tile.job = null;
  }

  ripen(state);
}
