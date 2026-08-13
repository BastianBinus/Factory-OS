import type { GameState, UnlockDef, UnlockId } from './types';
import { createRobot, grantUnlock, hasUnlock } from './GameState';
import { expandGrid, forEachTile, setTile, tileAt } from './grid';
import { canAfford, missingResources, spendResources } from './economy';
import { describeInventory, totalItems } from './resources';

/**
 * The tech tree as data. Everything the player can ever gain is a row below;
 * `applyUnlockEffect` is the only place that knows what a row does to the world.
 *
 * There is no mission chain and no quest log. The tree is the whole goal
 * structure: you see the next unlock, you see what it costs in harvested
 * material, and you work out for yourself what to automate to afford it. The
 * dependency graph (`requiresUnlocks`) is the only gate; the price tag is the
 * only objective.
 */

export const UNLOCKS: UnlockDef[] = [
  {
    id: 'move',
    label: 'move()',
    description: 'Drive the robot one tile north, east, south or west.',
    cost: {},
    commands: ['move'],
    conceptId: 'await',
  },
  {
    id: 'mine',
    label: 'mine()',
    description: 'Harvest the ripe crop on the tile the robot stands on.',
    cost: {},
    commands: ['mine'],
  },
  {
    id: 'cultivate',
    label: 'clear() and seed()',
    description: 'Turn a tile into a field, and plant a seed crystal in it.',
    cost: {},
    commands: ['clear', 'seed'],
  },
  {
    id: 'print',
    label: 'print()',
    description: 'Write a value into the console.',
    cost: {},
    commands: ['print'],
  },
  {
    id: 'scan',
    label: 'scan()',
    // Free, and owned from the first tick. A crop the player cannot look at is a
    // timer they have to count by hand, which is a worse game and a worse lesson.
    description: 'Read the tile below the robot: what is on it, and how long it has left.',
    cost: {},
    commands: ['scan'],
  },
  {
    id: 'trade',
    label: 'trade(from, to)',
    description: 'At the market, swap three of one ore for one of another. No hard dead ends.',
    cost: { iron_ore: 10 },
    commands: ['trade'],
  },
  {
    id: 'wait',
    label: 'wait()',
    description: 'Do nothing for a number of ticks — useful while a machine is running.',
    cost: { iron_ore: 12 },
    commands: ['wait'],
    conceptId: 'while',
  },
  {
    id: 'drop',
    label: 'drop()',
    description: 'Load what the robot carries into the machine it stands on.',
    cost: { iron_ore: 20 },
    commands: ['drop'],
  },
  {
    id: 'craft',
    label: 'craft() and take()',
    description: 'Start the machine below the robot, and collect what it produced.',
    cost: { iron_ore: 25 },
    requiresUnlocks: ['drop'],
    commands: ['craft', 'take'],
    conceptId: 'functions',
  },
  {
    id: 'scan_at',
    label: 'scanAt(x, y)',
    description: 'Read any tile in the factory without driving there.',
    cost: { iron_ingot: 15 },
    requiresUnlocks: ['scan'],
    commands: ['scanAt'],
    conceptId: 'if_else',
  },
  {
    id: 'capacity_20',
    label: 'Cargo rack',
    description: 'The robot carries 20 items instead of 10.',
    cost: { iron_ingot: 10 },
  },
  {
    id: 'capacity_50',
    label: 'Cargo hold',
    description: 'The robot carries 50 items.',
    cost: { iron_ingot: 25, gear: 5 },
    requiresUnlocks: ['capacity_20'],
  },
  {
    id: 'tick_300',
    label: 'Servo tuning',
    description: 'Every action takes 300 ms instead of 400 ms.',
    cost: { iron_ingot: 12 },
  },
  {
    id: 'tick_200',
    label: 'Servo overhaul',
    description: 'Every action takes 200 ms.',
    cost: { iron_ingot: 20, gear: 6 },
    requiresUnlocks: ['tick_300'],
  },
  {
    id: 'tick_120',
    label: 'Direct drive',
    description: 'Every action takes 120 ms.',
    cost: { gear: 20 },
    requiresUnlocks: ['tick_200'],
  },
  {
    id: 'grid_12',
    label: 'Factory floor 12 x 12',
    description: 'Buy the neighbouring land. It arrives raw — clear it and seed it.',
    cost: { iron_ingot: 25, gear: 4 },
    conceptId: 'arrays',
  },
  {
    id: 'grid_16',
    label: 'Factory floor 16 x 16',
    description: 'Expand the factory once more.',
    cost: { iron_ingot: 35, gear: 10 },
    requiresUnlocks: ['grid_12'],
    // The floor that finally makes a hand-counted route unreadable.
    conceptId: 'for_of',
  },
  {
    id: 'robot_2',
    label: 'Second robot',
    description: 'A second robot rolls off the ramp. It runs the same script.',
    cost: { gear: 20, copper_ingot: 15 },
    requiresUnlocks: ['grid_16'],
    // me() only means anything once there is someone else to be told apart from.
    commands: ['me'],
    conceptId: 'objects',
  },
  {
    id: 'calibration',
    label: 'Calibration bay',
    description:
      'The refinery accepts only the purest ore on the floor and destroys the rest. refine() feeds it your best batch.',
    cost: { iron_ingot: 30, gear: 12 },
    requiresUnlocks: ['craft'],
    commands: ['refine'],
    // No new concept: finding the maximum is arrays, already taught on grid_12.
  },
  {
    id: 'sorting',
    label: 'Sorting bay',
    description:
      'The press has 8 slots and fires only when they climb by purity. load() and swapSlots(i, j) let you sort them.',
    cost: { refined_ingot: 20, gear: 20 },
    requiresUnlocks: ['calibration'],
    commands: ['load', 'swapSlots', 'press'],
    conceptId: 'sorting',
  },
  {
    id: 'routing',
    label: 'Pipe routing',
    description:
      'Impassable structures rise across the floor. move() has to route around them, and worldSize() gives the grid bounds to search within.',
    cost: { refined_ingot: 30, gear: 25 },
    requiresUnlocks: ['sorting'],
    commands: ['worldSize'],
    conceptId: 'recursion',
  },
];

export function getUnlock(id: UnlockId): UnlockDef | undefined {
  return UNLOCKS.find((unlock) => unlock.id === id);
}

/** Which tech-tree node grants a command, so an error can point at the shop. */
export function unlockForCommand(command: string): UnlockDef | undefined {
  return UNLOCKS.find((unlock) => unlock.commands?.includes(command));
}

/** Command names the player script may call right now. */
export function unlockedCommands(state: GameState): string[] {
  // Always there: the readers cost nothing, and reset() is what makes a script
  // repeatable — locking that behind progress would only teach patience.
  const names = new Set<string>(['position', 'inventory', 'reset']);
  for (const id of state.unlocks) {
    for (const command of getUnlock(id)?.commands ?? []) names.add(command);
  }
  return [...names].sort();
}

// Shop ----------------------------------------------------------------------

export type PurchaseFailure =
  | 'unknown_unlock'
  | 'already_owned'
  | 'unlock_locked'
  | 'missing_resources';

export type PurchaseResult =
  | { ok: true; unlock: UnlockDef }
  | { ok: false; reason: PurchaseFailure; message: string };

/** Why a shop card is greyed out, or undefined when it can be bought. */
export function purchaseBlocker(state: GameState, id: UnlockId): PurchaseFailure | undefined {
  const unlock = getUnlock(id);
  if (!unlock) return 'unknown_unlock';
  if (hasUnlock(state, id)) return 'already_owned';
  if (unlock.requiresUnlocks?.some((required) => !hasUnlock(state, required))) {
    return 'unlock_locked';
  }
  if (!canAfford(state, unlock.cost)) return 'missing_resources';
  return undefined;
}

export function isPurchasable(state: GameState, id: UnlockId): boolean {
  return purchaseBlocker(state, id) === undefined;
}

/**
 * The node the tree nudges the player toward: the first unowned unlock, in tree
 * order, whose prerequisites are already met. Undefined once the tree is bought
 * out. This is guidance, not a gate — the player is free to save for anything.
 */
export function nextUnlock(state: GameState): UnlockDef | undefined {
  return UNLOCKS.find(
    (unlock) =>
      totalItems(unlock.cost) > 0 &&
      !hasUnlock(state, unlock.id) &&
      !(unlock.requiresUnlocks?.some((required) => !hasUnlock(state, required)) ?? false),
  );
}

/** Unlocks the shop should list at all — owned ones included, free starters not. */
export function visibleUnlocks(state: GameState): UnlockDef[] {
  return UNLOCKS.filter((unlock) => {
    if (totalItems(unlock.cost) === 0 && hasUnlock(state, unlock.id)) return false;
    return true;
  });
}

export function buyUnlock(state: GameState, id: UnlockId): PurchaseResult {
  const unlock = getUnlock(id);
  if (!unlock) {
    return { ok: false, reason: 'unknown_unlock', message: `There is no upgrade called '${id}'.` };
  }

  const blocker = purchaseBlocker(state, id);
  if (blocker) {
    return { ok: false, reason: blocker, message: blockerMessage(state, unlock, blocker) };
  }

  spendResources(state, unlock.cost);
  grantUnlock(state, id);
  applyUnlockEffect(state, id);

  return { ok: true, unlock };
}

function blockerMessage(state: GameState, unlock: UnlockDef, reason: PurchaseFailure): string {
  switch (reason) {
    case 'already_owned':
      return `${unlock.label} is already unlocked.`;
    case 'unlock_locked': {
      const missing = (unlock.requiresUnlocks ?? []).filter((id) => !hasUnlock(state, id));
      const labels = missing.map((id) => getUnlock(id)?.label ?? id).join(', ');
      return `${unlock.label} needs ${labels} first.`;
    }
    case 'missing_resources':
      return `${unlock.label} needs ${describeInventory(missingResources(state, unlock.cost))} more.`;
    default:
      return `${unlock.label} cannot be bought right now.`;
  }
}

// Effects -------------------------------------------------------------------

/**
 * The single place that turns an unlock id into a change of the world. Command
 * unlocks do nothing here — the worker API reads `state.unlocks` directly.
 */
export function applyUnlockEffect(state: GameState, id: UnlockId): void {
  switch (id) {
    case 'capacity_20':
      state.inventoryCapacity = Math.max(state.inventoryCapacity, 20);
      break;
    case 'capacity_50':
      state.inventoryCapacity = Math.max(state.inventoryCapacity, 50);
      break;
    case 'tick_300':
      state.tickRateMs = Math.min(state.tickRateMs, 300);
      break;
    case 'tick_200':
      state.tickRateMs = Math.min(state.tickRateMs, 200);
      break;
    case 'tick_120':
      state.tickRateMs = Math.min(state.tickRateMs, 120);
      break;
    case 'grid_12':
      state.grid = expandGrid(state.grid, 12);
      break;
    case 'grid_16':
      state.grid = expandGrid(state.grid, 16);
      break;
    case 'robot_2':
      addRobot(state);
      break;
    case 'routing':
      raiseWalls(state);
      break;
    default:
      break;
  }
}

/**
 * Drops a wall down the middle of the floor, leaving the top and bottom rows open
 * as the only way around. Deterministic, and it only ever converts open ground —
 * never a machine, a robot's tile or the market — so nothing the player built is
 * lost and no robot is walled in.
 */
function raiseWalls(state: GameState): void {
  const col = Math.floor(state.grid.width / 2);
  const taken = new Set(state.robots.map((robot) => `${robot.x},${robot.y}`));

  for (let y = 1; y < state.grid.height - 1; y += 1) {
    const tile = tileAt(state.grid, col, y);
    if (!tile || tile.kind !== 'ground') continue;
    if (taken.has(`${col},${y}`)) continue;
    setTile(state.grid, col, y, { kind: 'wall' });
  }
}

/** Places a new robot on the first free tile of ground, scanning from the north-west. */
function addRobot(state: GameState): void {
  const taken = new Set(state.robots.map((robot) => `${robot.x},${robot.y}`));
  let spot: { x: number; y: number } | undefined;

  forEachTile(state.grid, (tile, x, y) => {
    if (spot || tile.kind !== 'ground' || taken.has(`${x},${y}`)) return;
    spot = { x, y };
  });

  const place = spot ?? { x: 0, y: 0 };
  state.robots.push(createRobot(`r${state.robots.length + 1}`, place.x, place.y));
}
