import type {
  CommandErrorCode,
  CommandResult,
  Direction,
  GameState,
  GroundTile,
  Inventory,
  MachineTile,
  Robot,
  Tile,
} from '../game/types';
import { inBounds, isDirection, step, tileAt } from '../game/grid';
import {
  RESOURCES,
  RESOURCE_IDS,
  addItems,
  cloneInventory,
  describeInventory,
  isEmpty,
  isResourceId,
  removeItems,
  totalItems,
} from '../game/resources';
import { findRunnableRecipe, getRecipe, recipesFor } from '../game/recipes';
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
  return ctx.state.inventoryCapacity - totalItems(ctx.robot.inventory);
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
  addItems(ctx.robot.inventory, resource, haul);
  addItems(ctx.robot.inventory, 'seed_crystal', 1);
  ctx.state.stats.oreMined += haul;

  tile.state = 'raw';
  tile.resource = null;
  tile.ripeAt = null;
  tile.yield = 0;
  tile.purity = 0;

  return ok(resource, `harvested ${haul} ${resource} and 1 seed crystal`);
}

export function drop(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'machine') {
    return fail('nothing_here', 'There is no machine on this tile to drop into.');
  }
  if (isEmpty(ctx.robot.inventory)) {
    return fail('inventory_empty', 'The robot is not carrying anything.');
  }

  const accepted = acceptedInputs(tile);
  const moved: Inventory = {};
  let count = 0;

  for (const id of RESOURCE_IDS) {
    if (!accepted.has(id)) continue;
    const amount = ctx.robot.inventory[id] ?? 0;
    if (amount <= 0) continue;
    removeItems(ctx.robot.inventory, id, amount);
    addItems(tile.input, id, amount);
    addItems(moved, id, amount);
    count += amount;
  }

  if (count === 0) {
    return fail('bad_argument', `The ${tile.machine} does not take ${describeInventory(ctx.robot.inventory)}.`);
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

/** How many of `from` buy one of `to` at the market. */
export const TRADE_RATIO = 3;

export function trade(ctx: CommandContext, from: unknown, to: unknown): CommandResult {
  const tile = currentTile(ctx);

  if (!tile || tile.kind !== 'market') {
    return fail('nothing_here', 'The robot has to stand on the market tile to trade.');
  }
  if (!isResourceId(from) || !isResourceId(to)) {
    return fail(
      'bad_argument',
      `trade() needs two resource names — got (${JSON.stringify(from)}, ${JSON.stringify(to)}).`,
    );
  }
  if (from === to) {
    return fail('bad_argument', 'trade() needs two different resources.');
  }

  const held = ctx.robot.inventory[from] ?? 0;
  if (held < TRADE_RATIO) {
    return fail(
      'missing_input',
      `trade() turns ${TRADE_RATIO} ${RESOURCES[from].label.toLowerCase()} into 1 ${RESOURCES[to].label.toLowerCase()}, and the robot has ${held}.`,
    );
  }

  // Three in for one out only ever shrinks the load, so capacity never bites.
  const out = Math.floor(held / TRADE_RATIO);
  removeItems(ctx.robot.inventory, from, out * TRADE_RATIO);
  addItems(ctx.robot.inventory, to, out);

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
      };
    case 'market':
      return { type: 'market', x, y };
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
    }
    tile.job = null;
  }

  ripen(state);
}
