import type { GameState, MissionDef, MissionId, UnlockDef, UnlockId } from './types';
import { createRobot, grantUnlock, hasUnlock } from './GameState';
import { expandGrid, forEachTile } from './grid';
import { spend } from './economy';

/**
 * Tech tree and mission chain as data. Everything the player can ever gain is a
 * row in one of the two tables below; `applyUnlockEffect` is the only place that
 * knows what a row actually does to the world.
 *
 * Missions run strictly in order — a mission can only complete once every
 * mission before it is done, so the learning path never gets skipped.
 */

export const UNLOCKS: UnlockDef[] = [
  {
    id: 'move',
    label: 'move()',
    description: 'Drive the robot one tile north, east, south or west.',
    cost: 0,
    commands: ['move'],
    conceptId: 'await',
  },
  {
    id: 'mine',
    label: 'mine()',
    description: 'Harvest the ripe crop on the tile the robot stands on.',
    cost: 0,
    commands: ['mine'],
  },
  {
    id: 'cultivate',
    label: 'clear() and seed()',
    description: 'Turn a tile into a field, and plant a seed crystal in it.',
    cost: 0,
    commands: ['clear', 'seed'],
  },
  {
    id: 'print',
    label: 'print()',
    description: 'Write a value into the console.',
    cost: 0,
    commands: ['print'],
  },
  {
    id: 'sell',
    label: 'sell()',
    description: 'Sell everything the robot carries. Only works on the market tile.',
    cost: 60,
    commands: ['sell'],
  },
  {
    id: 'wait',
    label: 'wait()',
    description: 'Do nothing for a number of ticks — useful while a machine is running.',
    cost: 80,
    commands: ['wait'],
  },
  {
    id: 'scan',
    label: 'scan()',
    // Free, and owned from the first tick. A crop the player cannot look at is a
    // timer they have to count by hand, which is a worse game and a worse lesson.
    description: 'Read the tile below the robot: what is on it, and how long it has left.',
    cost: 0,
    commands: ['scan'],
  },
  {
    id: 'drop',
    label: 'drop()',
    description: 'Load what the robot carries into the machine it stands on.',
    cost: 100,
    requiresMission: 'm2_mine',
    commands: ['drop'],
  },
  {
    id: 'craft',
    label: 'craft() and take()',
    description: 'Start the machine below the robot, and collect what it produced.',
    cost: 180,
    requiresUnlocks: ['drop'],
    commands: ['craft', 'take'],
    conceptId: 'functions',
  },
  {
    id: 'scan_at',
    label: 'scanAt(x, y)',
    description: 'Read any tile in the factory without driving there.',
    cost: 450,
    requiresUnlocks: ['scan'],
    commands: ['scanAt'],
    conceptId: 'if_else',
  },
  {
    id: 'capacity_20',
    label: 'Cargo rack',
    description: 'The robot carries 20 items instead of 10.',
    cost: 250,
  },
  {
    id: 'capacity_50',
    label: 'Cargo hold',
    description: 'The robot carries 50 items.',
    cost: 1200,
    requiresUnlocks: ['capacity_20'],
  },
  {
    id: 'tick_300',
    label: 'Servo tuning',
    description: 'Every action takes 300 ms instead of 400 ms.',
    cost: 300,
  },
  {
    id: 'tick_200',
    label: 'Servo overhaul',
    description: 'Every action takes 200 ms.',
    cost: 900,
    requiresUnlocks: ['tick_300'],
  },
  {
    id: 'tick_120',
    label: 'Direct drive',
    description: 'Every action takes 120 ms.',
    cost: 3000,
    requiresUnlocks: ['tick_200'],
  },
  {
    id: 'grid_12',
    label: 'Factory floor 12 x 12',
    description: 'Buy the neighbouring land. It arrives raw — clear it and seed it.',
    cost: 600,
    conceptId: 'arrays',
  },
  {
    id: 'grid_16',
    label: 'Factory floor 16 x 16',
    description: 'Expand the factory once more.',
    cost: 2500,
    requiresUnlocks: ['grid_12'],
    // The floor that finally makes a hand-counted route unreadable.
    conceptId: 'for_of',
  },
  {
    id: 'robot_2',
    label: 'Second robot',
    description: 'A second robot rolls off the ramp. It runs the same script.',
    cost: 5000,
    requiresMission: 'm6_rich',
    // me() only means anything once there is someone else to be told apart from.
    commands: ['me'],
    conceptId: 'objects',
  },
];

export const MISSIONS: MissionDef[] = [
  {
    id: 'm1_move',
    title: 'First steps',
    summary: 'Drive the robot across 20 tiles. A while loop does it without repeating yourself.',
    goal: { type: 'move', target: 20 },
    rewardCredits: 40,
    grants: ['sell'],
    conceptId: 'while',
  },
  {
    id: 'm2_mine',
    title: 'Dig in',
    summary: 'Mine 15 units of ore and sell them at the market in the north-west corner.',
    goal: { type: 'mine', target: 15 },
    rewardCredits: 60,
    grants: ['wait'],
  },
  {
    id: 'm3_earn',
    title: 'Turning a profit',
    summary: 'Earn 200 credits in total. Then the smelter is worth unlocking.',
    goal: { type: 'credits_earned', target: 200 },
    rewardCredits: 100,
    grants: [],
    conceptId: 'if_else',
  },
  {
    id: 'm4_smelt',
    title: 'Hot metal',
    summary: 'Smelt 10 iron ingots. Ore goes in with drop(), craft() starts the furnace.',
    goal: { type: 'crafted', resource: 'iron_ingot', target: 10 },
    rewardCredits: 250,
    grants: [],
    conceptId: 'functions',
  },
  {
    id: 'm5_gears',
    title: 'Assembly line',
    summary: 'Build 5 gears from 2 iron and 1 copper ingot each.',
    goal: { type: 'crafted', resource: 'gear', target: 5 },
    rewardCredits: 500,
    grants: ['grid_12'],
    conceptId: 'arrays',
  },
  {
    id: 'm6_rich',
    title: 'Industrialist',
    summary: 'Earn 2000 credits in total. A second robot becomes available.',
    goal: { type: 'credits_earned', target: 2000 },
    rewardCredits: 1000,
    grants: [],
    conceptId: 'objects',
  },
];

export function getUnlock(id: UnlockId): UnlockDef | undefined {
  return UNLOCKS.find((unlock) => unlock.id === id);
}

export function getMission(id: MissionId): MissionDef | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}

/** Which tech-tree node grants a command, so an error can point at the shop. */
export function unlockForCommand(command: string): UnlockDef | undefined {
  return UNLOCKS.find((unlock) => unlock.commands?.includes(command));
}

/** Command names the player script may call right now. */
export function unlockedCommands(state: GameState): string[] {
  // Always there: the readers cost nothing, and reset() is what makes a script
  // repeatable — locking that behind progress would only teach patience.
  const names = new Set<string>(['position', 'inventory', 'credits', 'reset']);
  for (const id of state.unlocks) {
    for (const command of getUnlock(id)?.commands ?? []) names.add(command);
  }
  return [...names].sort();
}

// Missions ------------------------------------------------------------------

export interface MissionProgress {
  id: MissionId;
  current: number;
  target: number;
  complete: boolean;
}

export function missionProgress(state: GameState, mission: MissionDef): MissionProgress {
  const goal = mission.goal;
  let current = 0;

  switch (goal.type) {
    case 'move':
      current = state.stats.tilesMoved;
      break;
    case 'mine':
      current = state.stats.oreMined;
      break;
    case 'credits_earned':
      current = state.stats.creditsEarned;
      break;
    case 'crafted':
      current = state.stats.crafted[goal.resource] ?? 0;
      break;
  }

  return {
    id: mission.id,
    current: Math.min(current, goal.target),
    target: goal.target,
    complete: current >= goal.target,
  };
}

/** The mission the player is working on, or undefined once the chain is done. */
export function activeMission(state: GameState): MissionDef | undefined {
  return MISSIONS.find((mission) => !state.completedMissions.includes(mission.id));
}

export interface MissionCompletion {
  mission: MissionDef;
  granted: UnlockId[];
  credits: number;
}

/**
 * Completes every mission whose goal is met, in chain order, and hands out the
 * rewards. Safe to call after every tick — already completed missions are skipped.
 */
export function evaluateMissions(state: GameState): MissionCompletion[] {
  const completions: MissionCompletion[] = [];

  for (;;) {
    const mission = activeMission(state);
    if (!mission) break;
    if (!missionProgress(state, mission).complete) break;

    state.completedMissions.push(mission.id);
    state.credits += mission.rewardCredits;

    const granted: UnlockId[] = [];
    for (const id of mission.grants) {
      if (grantUnlock(state, id)) {
        applyUnlockEffect(state, id);
        granted.push(id);
      }
    }

    completions.push({ mission, granted, credits: mission.rewardCredits });
  }

  return completions;
}

// Shop ----------------------------------------------------------------------

export type PurchaseFailure =
  | 'unknown_unlock'
  | 'already_owned'
  | 'mission_locked'
  | 'unlock_locked'
  | 'too_expensive';

export type PurchaseResult =
  | { ok: true; unlock: UnlockDef }
  | { ok: false; reason: PurchaseFailure; message: string };

/** Why a shop card is greyed out, or undefined when it can be bought. */
export function purchaseBlocker(state: GameState, id: UnlockId): PurchaseFailure | undefined {
  const unlock = getUnlock(id);
  if (!unlock) return 'unknown_unlock';
  if (hasUnlock(state, id)) return 'already_owned';
  if (unlock.requiresMission && !state.completedMissions.includes(unlock.requiresMission)) {
    return 'mission_locked';
  }
  if (unlock.requiresUnlocks?.some((required) => !hasUnlock(state, required))) {
    return 'unlock_locked';
  }
  if (state.credits < unlock.cost) return 'too_expensive';
  return undefined;
}

export function isPurchasable(state: GameState, id: UnlockId): boolean {
  return purchaseBlocker(state, id) === undefined;
}

/** Unlocks the shop should list at all — owned ones included, hard-locked ones not. */
export function visibleUnlocks(state: GameState): UnlockDef[] {
  return UNLOCKS.filter((unlock) => {
    if (unlock.cost === 0 && hasUnlock(state, unlock.id)) return false;
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

  spend(state, unlock.cost);
  grantUnlock(state, id);
  applyUnlockEffect(state, id);

  return { ok: true, unlock };
}

function blockerMessage(state: GameState, unlock: UnlockDef, reason: PurchaseFailure): string {
  switch (reason) {
    case 'already_owned':
      return `${unlock.label} is already unlocked.`;
    case 'mission_locked': {
      const mission = unlock.requiresMission ? getMission(unlock.requiresMission) : undefined;
      return `${unlock.label} needs the mission '${mission?.title ?? unlock.requiresMission}' first.`;
    }
    case 'unlock_locked': {
      const missing = (unlock.requiresUnlocks ?? []).filter((id) => !hasUnlock(state, id));
      const labels = missing.map((id) => getUnlock(id)?.label ?? id).join(', ');
      return `${unlock.label} needs ${labels} first.`;
    }
    case 'too_expensive':
      return `${unlock.label} costs ${unlock.cost} cr, you have ${state.credits} cr.`;
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
    default:
      break;
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
