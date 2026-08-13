/**
 * The whole game is described by GameState: a plain, JSON-serialisable object.
 * Nothing in this folder may import the DOM, three.js or the worker — that is
 * what makes the rules testable without a browser.
 */

export type Direction = 'north' | 'east' | 'south' | 'west';

export type ResourceId =
  | 'iron_ore'
  | 'copper_ore'
  | 'iron_ingot'
  | 'copper_ingot'
  | 'gear'
  | 'seed_crystal';

export type MachineId = 'smelter' | 'assembler' | 'seeder';

/** Sparse on purpose: a missing key means zero. Use the helpers in resources.ts. */
export type Inventory = Partial<Record<ResourceId, number>>;

export type GroundState = 'raw' | 'prepared' | 'growing' | 'ripe';

/**
 * A tile of factory floor and everything that can be growing on it.
 *
 * The four states are a cycle, not a ladder: clear() takes raw to prepared,
 * seed() takes prepared to growing, the world takes growing to ripe on its own
 * clock, and mine() takes ripe back to raw. Nothing here ever advances without
 * a robot except the one step the player already paid for.
 */
export interface GroundTile {
  kind: 'ground';
  state: GroundState;
  /** What is planted, or null on raw and prepared ground. */
  resource: ResourceId | null;
  /** Tick this crop turns ripe, or null when nothing is growing. */
  ripeAt: number | null;
  /** What mine() will hand over. Fixed at seeding time from the neighbours. */
  yield: number;
  /** 1..10, fixed at seeding time. The sorting bay in 10d reads it. */
  purity: number;
}

export interface MachineJob {
  recipeId: string;
  readyAt: number;
}

export interface MachineTile {
  kind: 'machine';
  machine: MachineId;
  input: Inventory;
  output: Inventory;
  job: MachineJob | null;
}

export interface MarketTile {
  kind: 'market';
}

export type Tile = GroundTile | MachineTile | MarketTile;

export interface Robot {
  id: string;
  x: number;
  y: number;
  facing: Direction;
  inventory: Inventory;
}

export interface Grid {
  width: number;
  height: number;
  /** Row-major, length === width * height. */
  tiles: Tile[];
}

export interface Recipe {
  id: string;
  machine: MachineId;
  inputs: Inventory;
  output: ResourceId;
  outputAmount: number;
  ticks: number;
}

export interface ResourceDef {
  id: ResourceId;
  label: string;
  /** CSS custom property name (without --) used for the colour dot and the mesh. */
  colorToken: string;
}

export type UnlockId =
  | 'move'
  | 'mine'
  | 'cultivate'
  | 'drop'
  | 'trade'
  | 'wait'
  | 'print'
  | 'scan'
  | 'craft'
  | 'scan_at'
  | 'grid_12'
  | 'grid_16'
  | 'capacity_20'
  | 'capacity_50'
  | 'tick_300'
  | 'tick_200'
  | 'tick_120'
  | 'robot_2';

export type ConceptId =
  | 'await'
  | 'while'
  | 'if_else'
  | 'functions'
  | 'arrays'
  | 'objects'
  | 'for_of'
  // Reached by switching the cloud on rather than by playing.
  | 'promises'
  | 'fetch'
  | 'status_codes'
  | 'database_row';

export interface ConceptDef {
  id: ConceptId;
  title: string;
  /** Two to four sentences. Prose, not a reference entry. */
  body: string;
  codeExample: string;
}

export interface UnlockDef {
  id: UnlockId;
  label: string;
  description: string;
  /** What it costs to buy, paid straight out of harvested resources. Empty = free. */
  cost: Inventory;
  /** Command names this unlock exposes to the player script, if any. */
  commands?: string[];
  /** Other unlocks that must be owned first. The tech tree is the only gate. */
  requiresUnlocks?: UnlockId[];
  /** JS concept explained when this unlock becomes available. */
  conceptId?: ConceptId;
}

export interface Stats {
  tilesMoved: number;
  oreMined: number;
  crafted: Inventory;
}

export interface GameState {
  version: number;
  tick: number;
  grid: Grid;
  robots: Robot[];
  unlocks: UnlockId[];
  /**
   * Concept ids already shown to the player. Deliberately loose strings: a save
   * from an older build may name a concept this one no longer has, and that is
   * not a reason to reject the save.
   */
  seenConcepts: string[];
  /** How far the opening tutorial got. `ONBOARDING_DONE` means it is over. */
  onboardingStep: number;
  stats: Stats;
  script: string;
  /** Milliseconds per tick. Lowered by upgrades, never by a speed slider. */
  tickRateMs: number;
  inventoryCapacity: number;
}

export type CommandErrorCode =
  | 'blocked'
  | 'nothing_here'
  | 'inventory_full'
  | 'inventory_empty'
  | 'depleted'
  | 'no_recipe'
  | 'missing_input'
  | 'busy'
  | 'not_ready'
  | 'out_of_bounds'
  | 'bad_argument'
  | 'no_robot';

export type CommandResult =
  | { ok: true; value: unknown; log?: string }
  | { ok: false; code: CommandErrorCode; error: string };
