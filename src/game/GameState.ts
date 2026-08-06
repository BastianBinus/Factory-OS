import type { GameState, Grid, Robot, Tile, UnlockId } from './types';
import { expandGrid } from './grid';

export const SAVE_VERSION = 1;

export const ORE_NODE_AMOUNT = 20;
export const DEFAULT_TICK_RATE_MS = 400;
export const DEFAULT_CAPACITY = 10;
export const DEFAULT_REGROW_TICKS = 30;

export const STARTING_UNLOCKS: UnlockId[] = ['move', 'mine', 'print'];

export const STARTER_SCRIPT = `// Every command that takes time returns a promise,
// so it needs 'await' in front of it.

while (true) {
  await move('south');
  await move('east');
}
`;

/**
 * The opening factory floor. One character per tile:
 *   M market · S smelter · A assembler · I iron ore · C copper ore · . empty
 * Row 0 is the north edge.
 */
const INITIAL_LAYOUT = [
  'M.......',
  '..I..I..',
  '........',
  '...SA...',
  '..I...C.',
  '........',
  '.C....I.',
  '........',
];

function tileFromChar(char: string): Tile {
  switch (char) {
    case 'M':
      return { kind: 'market' };
    case 'S':
      return { kind: 'machine', machine: 'smelter', input: {}, output: {}, job: null };
    case 'A':
      return { kind: 'machine', machine: 'assembler', input: {}, output: {}, job: null };
    case 'I':
      return { kind: 'ore', resource: 'iron_ore', amount: ORE_NODE_AMOUNT, regrowAt: null };
    case 'C':
      return { kind: 'ore', resource: 'copper_ore', amount: ORE_NODE_AMOUNT, regrowAt: null };
    default:
      return { kind: 'floor' };
  }
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
      tiles.push(tileFromChar(row[x] ?? '.'));
    }
  }

  return { width, height, tiles };
}

export function createRobot(id: string, x: number, y: number): Robot {
  return { id, x, y, facing: 'south', inventory: {} };
}

/** Where robot number `index` parks at the start of a run. */
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
  state.grid = expandGrid(gridFromLayout(INITIAL_LAYOUT), size, ORE_NODE_AMOUNT);

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

/** The robot a script controls when it does not name one. */
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
