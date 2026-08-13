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
  | 'seed_crystal'
  | 'refined_ingot'
  | 'component'
  | 'alloy';

/** The raw ores. These are the only resources carried as purity-bearing batches. */
export type OreId = 'iron_ore' | 'copper_ore';

export type MachineId = 'smelter' | 'assembler' | 'seeder' | 'refinery' | 'press' | 'foundry';

/** How many slots the sorting press has. */
export const PRESS_SLOTS = 8;

/** Sparse on purpose: a missing key means zero. Use the helpers in resources.ts. */
export type Inventory = Partial<Record<ResourceId, number>>;

/**
 * A parcel of ore stamped with the purity of the tile it was mined from.
 *
 * Ore is the one thing carried as batches rather than a bare count, because the
 * refinery and the press judge it by purity — a count would throw that away the
 * moment the ore left the ground.
 */
export interface Batch {
  resource: OreId;
  amount: number;
  /** 1..10, inherited from the ground tile at mine time. */
  purity: number;
}

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
  /** The press's ordered slots. `null` on every other machine. */
  slots?: (Batch | null)[];
  /** The foundry's pour order: how many hot smelters it needs. Absent elsewhere. */
  order?: { need: number };
}

export interface MarketTile {
  kind: 'market';
}

/** An impassable structure. The routing tier drops these in to force a search. */
export interface WallTile {
  kind: 'wall';
}

export type Tile = GroundTile | MachineTile | MarketTile | WallTile;

export interface Robot {
  id: string;
  x: number;
  y: number;
  facing: Direction;
  /** Everything but raw ore: ingots, gears, crystals. Ore lives in `batches`. */
  inventory: Inventory;
  /** Raw ore the robot carries, each parcel keeping the purity it was mined at. */
  batches: Batch[];
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
  | 'robot_2'
  | 'calibration'
  | 'sorting'
  | 'foundry'
  | 'routing';

export type ConceptId =
  | 'await'
  | 'while'
  | 'if_else'
  | 'functions'
  | 'arrays'
  | 'objects'
  | 'for_of'
  | 'sorting'
  | 'recursion'
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

/** The production steps the throughput meter counts, in flow order. */
export type StageId = 'seed' | 'mine' | 'smelt' | 'assemble' | 'press';

/** What one tick produced, per stage. The unit the ring buffer is made of. */
export interface RateSample {
  tick: number;
  produced: Partial<Record<StageId, number>>;
}

export interface GameState {
  version: number;
  tick: number;
  grid: Grid;
  robots: Robot[];
  unlocks: UnlockId[];
  /**
   * One RateSample per tick, newest last, capped at a fixed length. The throughput
   * meter and the bottleneck graph read their whole window out of this.
   */
  history: RateSample[];
  /**
   * What the current tick has produced so far, filled by the production sites as
   * they run and drained into `history` when the tick closes. Transient: it is
   * always empty at rest, which is why a save never carries anything in it.
   */
  tickProduced: Partial<Record<StageId, number>>;
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
