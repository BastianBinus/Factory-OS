import type { GameState, Grid, GroundTile, ResourceId, Robot, Tile, UnlockId } from './types';
import { expandGrid } from './grid';
import { BASE_YIELD, purityFor } from './cultivation';

export const SAVE_VERSION = 1;

export const ORE_NODE_AMOUNT = 20;
export const DEFAULT_TICK_RATE_MS = 400;
export const DEFAULT_CAPACITY = 10;
export const DEFAULT_REGROW_TICKS = 30;

export const STARTING_UNLOCKS: UnlockId[] = ['move', 'mine', 'print'];

/** Steps of the opening tutorial; anything at or above this means it is over. */
export const ONBOARDING_DONE = 3;

/**
 * The script a new player finds. It is entirely commented out on purpose: the
 * tutorial asks them to write the first live line themselves, and a starter
 * script that already runs would take that away — and make the second tutorial
 * step complete itself before they had typed anything.
 *
 * Uncommented, it shuttles between the two iron patches and replants both. It
 * runs correctly for two round trips and then stops on a full inventory, which
 * is the first moment the game asks for a better program rather than a longer
 * one. That is the intended lesson, not an oversight.
 */
export const STARTER_SCRIPT = `// This is your script. It drives the robot in the factory
// behind this panel, and it runs from top to bottom.
//
// Every command that makes the robot do something takes time.
// It hands back a promise instead of a result, so you write
// 'await' in front of it to wait for the robot to finish.
//
// Nothing in this factory refills itself. You harvest a patch,
// clear it and seed it again - that cycle is the whole game.
//
// Remove the // in front of the lines below, then press
// Ctrl+Enter to run it.

// while (true) {
//   await mine();
//   await clear();
//   await seed('iron_ore');
//
//   // Walk to the other iron patch while this one grows.
//   await move('south');
//   await move('south');
//   await move('south');
//   await move('south');
//   await move('south');
//
//   await mine();
//   await clear();
//   await seed('iron_ore');
//
//   await move('north');
//   await move('north');
//   await move('north');
//   await move('north');
//   await move('north');
// }
`;

/**
 * The opening factory floor. One character per tile:
 *   M market · S smelter · A assembler · D seeder
 *   I ripe iron · C ripe copper · . raw ground
 * Row 0 is the north edge.
 *
 * Exported because the save migration rebuilds a pre-cultivation grid from it —
 * a v1 save has ore tiles that no longer exist, and handing the player a blank
 * field with no machines and no ripe patch would be a save they cannot play.
 *
 * The three ripe patches are the seed capital. Without at least one, the very
 * first mine() has nothing to harvest, no crystal ever exists, and seed() can
 * never be called: the whole loop fails to start.
 */
export const INITIAL_LAYOUT = [
  'M.......',
  '.I......',
  '........',
  '...SA...',
  '..D.....',
  '........',
  '.I....C.',
  '........',
];

function tileFromChar(char: string, x: number, y: number): Tile {
  switch (char) {
    case 'M':
      return { kind: 'market' };
    case 'S':
      return { kind: 'machine', machine: 'smelter', input: {}, output: {}, job: null };
    case 'A':
      return { kind: 'machine', machine: 'assembler', input: {}, output: {}, job: null };
    case 'D':
      return { kind: 'machine', machine: 'seeder', input: {}, output: {}, job: null };
    case 'I':
      return ripeGround('iron_ore', x, y);
    case 'C':
      return ripeGround('copper_ore', x, y);
    default:
      return rawGround();
  }
}

export function rawGround(): GroundTile {
  return { kind: 'ground', state: 'raw', resource: null, ripeAt: null, yield: 0, purity: 0 };
}

function ripeGround(resource: ResourceId, x: number, y: number): GroundTile {
  return {
    kind: 'ground',
    state: 'ripe',
    resource,
    ripeAt: null,
    yield: BASE_YIELD,
    purity: purityFor(x, y, 0),
  };
}

export function gridFromLayout(layout: string[]): Grid {
  const height = layout.length;
  const width = layout[0]?.length ?? 0;
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = layout[y] ?? '';
    if (row.length !== width) {
      throw new Error(`Layout row ${y} has length ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x += 1) {
      tiles.push(tileFromChar(row[x] ?? '.', x, y));
    }
  }

  return { width, height, tiles };
}

export function createRobot(id: string, x: number, y: number): Robot {
  return { id, x, y, facing: 'south', inventory: {} };
}

/**
 * Where robot number `index` parks at the start of a run.
 *
 * Not the middle of the floor, and deliberately so. It is one tile off the
 * market in the north-west corner, which is where selling happens and where the
 * corner stays no matter how far the grid later grows to the south-east — a
 * start point defined as "the centre" would wander with every grid upgrade while
 * the market did not.
 *
 * It is also load-bearing for the tutorial: column x = 1 is the only column in
 * `INITIAL_LAYOUT` where walking south runs into ore (copper at 1,6), which is
 * exactly what the commented-out starter script does. Moving this without moving
 * that ore leaves a new player's first script walking into a wall.
 */
function startPosition(index: number): { x: number; y: number } {
  return { x: 1 + index, y: 1 };
}

export function createInitialState(): GameState {
  const start = startPosition(0);
  return {
    version: SAVE_VERSION,
    tick: 0,
    credits: 0,
    grid: gridFromLayout(INITIAL_LAYOUT),
    robots: [createRobot('r1', start.x, start.y)],
    unlocks: [...STARTING_UNLOCKS],
    completedMissions: [],
    seenConcepts: [],
    onboardingStep: 0,
    stats: { tilesMoved: 0, oreMined: 0, creditsEarned: 0, itemsSold: 0, crafted: {} },
    script: STARTER_SCRIPT,
    tickRateMs: DEFAULT_TICK_RATE_MS,
    inventoryCapacity: DEFAULT_CAPACITY,
    oreRegrowTicks: DEFAULT_REGROW_TICKS,
  };
}

/**
 * Puts the factory floor back to how a run finds it: robots parked, ore full,
 * machines and inventories empty, tick counter at zero.
 *
 * What it deliberately leaves alone is everything the player *earned* — credits,
 * unlocks, mission progress, the lifetime stats those missions count, and the
 * grid size. Resetting is for making a script repeatable, not for giving up
 * progress; that distinction is the whole reason this is not `createInitialState`.
 */
export function resetWorld(state: GameState): void {
  // expandGrid is seeded by the grid size, so a rebuilt 12x12 is the same 12x12.
  const size = Math.max(state.grid.width, state.grid.height);
  state.grid = expandGrid(gridFromLayout(INITIAL_LAYOUT), size);

  state.robots.forEach((robot, index) => {
    const start = startPosition(index);
    robot.x = start.x;
    robot.y = start.y;
    robot.facing = 'south';
    robot.inventory = {};
  });

  state.tick = 0;
}

export function getRobot(state: GameState, id: string): Robot | undefined {
  return state.robots.find((robot) => robot.id === id);
}

/**
 * The robot that speaks for the fleet where exactly one may act: it is the only
 * one allowed to reset the floor. Every other job now names its robot.
 */
export function primaryRobot(state: GameState): Robot | undefined {
  return state.robots[0];
}

export function hasUnlock(state: GameState, id: UnlockId): boolean {
  return state.unlocks.includes(id);
}

export function grantUnlock(state: GameState, id: UnlockId): boolean {
  if (state.unlocks.includes(id)) return false;
  state.unlocks.push(id);
  return true;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
