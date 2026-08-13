import type { GameState } from './types';
import {
  DEFAULT_CAPACITY,
  DEFAULT_TICK_RATE_MS,
  INITIAL_LAYOUT,
  ONBOARDING_DONE,
  SAVE_VERSION,
  STARTER_SCRIPT,
  STARTING_UNLOCKS,
  createInitialState,
  gridFromLayout,
} from './GameState';
import { expandGrid } from './grid';
import { BASE_PURITY } from './batches';
import { readString, remove, writeString } from '../utils/storage';

export const SAVE_KEY = 'factoryos.save';

/**
 * When the local save was last written, epoch milliseconds.
 *
 * Deliberately a second key rather than a field inside the save. The save is the
 * GameState verbatim, and that equivalence is worth more than the convenience of
 * one extra property - it is what lets a round trip be compared with `toEqual`.
 * A missing or unreadable stamp reads as 0, which simply sorts as oldest.
 */
export const SAVE_STAMP_KEY = 'factoryos.savedAt';

/**
 * A save is the GameState verbatim — no separate DTO, because the state is
 * already a plain JSON object by design. What this module adds is a version
 * number, a migration chain and a paranoid read path: a corrupt or half-written
 * save must never stop the game from starting, it just starts a new one.
 */

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*. Version 0 is any save written
 * before versioning existed; it is filled up with today's defaults.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (data) => ({
    ...data,
    tickRateMs: data['tickRateMs'] ?? DEFAULT_TICK_RATE_MS,
    inventoryCapacity: data['inventoryCapacity'] ?? DEFAULT_CAPACITY,
    seenConcepts: data['seenConcepts'] ?? [],
    completedMissions: data['completedMissions'] ?? [],
    unlocks: data['unlocks'] ?? [...STARTING_UNLOCKS],
    script: data['script'] ?? STARTER_SCRIPT,
    version: 1,
  }),

  /**
   * Cultivation. Every ore node and every floor tile in a v1 save describes a
   * world that no longer exists, and there is no honest tile-by-tile conversion:
   * an ore node was a thing that refilled itself, and nothing does that any more.
   *
   * So the floor is rebuilt from scratch at the size the player paid for —
   * exactly what resetWorld() does — and everything they earned is left
   * untouched. It costs them the arrangement of a floor they never arranged.
   */
  1: (data) => {
    const next = { ...data };
    delete next['oreRegrowTicks'];

    const grid = next['grid'];
    const size =
      isRecord(grid) && typeof grid['width'] === 'number' && typeof grid['height'] === 'number'
        ? Math.max(grid['width'], grid['height'])
        : 8;

    next['grid'] = expandGrid(gridFromLayout(INITIAL_LAYOUT), size);
    next['version'] = 2;
    return next;
  },

  /**
   * Resources become the currency. Credits, the mission chain and sell() are
   * gone. The metal the player earned comes back as iron ore at the old sell
   * price of three, dropped into the first robot; the script and the unlocks
   * (minus sell, which no longer exists) survive untouched. Nothing is lost —
   * only re-denominated.
   */
  2: (data) => {
    const next = { ...data };

    const credits = next['credits'];
    const robots = Array.isArray(next['robots']) ? next['robots'] : [];
    const first = robots[0];
    if (typeof credits === 'number' && credits > 0 && isRecord(first)) {
      const inventory = isRecord(first['inventory']) ? { ...first['inventory'] } : {};
      const held = typeof inventory['iron_ore'] === 'number' ? inventory['iron_ore'] : 0;
      inventory['iron_ore'] = held + Math.floor(credits / 3);
      first['inventory'] = inventory;
    }

    delete next['credits'];
    delete next['completedMissions'];

    if (isRecord(next['stats'])) {
      const stats = { ...next['stats'] };
      delete stats['creditsEarned'];
      delete stats['itemsSold'];
      next['stats'] = stats;
    }

    if (Array.isArray(next['unlocks'])) {
      next['unlocks'] = next['unlocks'].filter((id) => id !== 'sell');
    }

    next['version'] = 3;
    return next;
  },

  /**
   * Instrumentation. The throughput meter reads a ring buffer of per-tick
   * production that older saves never kept, so it simply starts empty and fills
   * as the factory runs. Nothing the player earned depends on it.
   */
  3: (data) => ({ ...data, history: [], tickProduced: {}, version: 4 }),

  /**
   * Batches. Ore leaves the count inventory and becomes purity-bearing parcels.
   * Any ore a robot was carrying comes back as one batch at the neutral purity —
   * the tile it came from is long gone, so there is no grade to recover, and
   * nothing is lost.
   */
  4: (data) => {
    const robots = Array.isArray(data['robots']) ? data['robots'] : [];
    for (const robot of robots) {
      if (!isRecord(robot)) continue;
      const inventory = isRecord(robot['inventory']) ? { ...robot['inventory'] } : {};
      const batches = Array.isArray(robot['batches']) ? robot['batches'] : [];
      for (const ore of ['iron_ore', 'copper_ore']) {
        const amount = typeof inventory[ore] === 'number' ? (inventory[ore] as number) : 0;
        if (amount > 0) batches.push({ resource: ore, amount, purity: BASE_PURITY });
        delete inventory[ore];
      }
      robot['inventory'] = inventory;
      robot['batches'] = batches;
    }
    return { ...data, robots, version: 5 };
  },
};

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, version: SAVE_VERSION });
}

export type LoadFailure = 'empty' | 'unreadable' | 'invalid' | 'too_new';

export type LoadResult =
  | { ok: true; state: GameState; migratedFrom?: number }
  | { ok: false; reason: LoadFailure; message: string };

export function deserialize(raw: string | null): LoadResult {
  if (raw === null || raw.trim() === '') {
    return { ok: false, reason: 'empty', message: 'No save found.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'unreadable', message: 'The save could not be parsed as JSON.' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: 'invalid', message: 'The save is not an object.' };
  }

  const originalVersion = typeof parsed['version'] === 'number' ? parsed['version'] : 0;
  if (originalVersion > SAVE_VERSION) {
    return {
      ok: false,
      reason: 'too_new',
      message: `This save was written by a newer version of the game (${originalVersion}).`,
    };
  }

  let data = parsed;
  for (let version = originalVersion; version < SAVE_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      return {
        ok: false,
        reason: 'invalid',
        message: `No migration from save version ${version}.`,
      };
    }
    data = migrate(data);
  }

  if (!isGameState(data)) {
    return { ok: false, reason: 'invalid', message: 'The save is missing required fields.' };
  }

  const state = data;
  state.version = SAVE_VERSION;
  fillGaps(state);

  return originalVersion === SAVE_VERSION
    ? { ok: true, state }
    : { ok: true, state, migratedFrom: originalVersion };
}

export function saveGame(state: GameState): boolean {
  const written = writeString(SAVE_KEY, serialize(state));
  if (written) writeString(SAVE_STAMP_KEY, String(Date.now()));
  return written;
}

/** Epoch milliseconds of the last local save, or 0 when there is none to trust. */
export function localSavedAt(): number {
  const raw = readString(SAVE_STAMP_KEY);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function loadGame(): LoadResult {
  return deserialize(readString(SAVE_KEY));
}

/** What `main.ts` calls at boot: always returns something playable. */
export function loadOrCreate(): { state: GameState; result: LoadResult } {
  const result = loadGame();
  return { state: result.ok ? result.state : createInitialState(), result };
}

export function clearSave(): void {
  remove(SAVE_KEY);
  remove(SAVE_STAMP_KEY);
}

// Validation ----------------------------------------------------------------

/**
 * Fields added to the state after a save was already written.
 *
 * They are filled in here rather than demanded by `isGameState`, because a field
 * with an obvious default is not worth throwing a factory away over. The
 * tutorial step in particular defaults to *finished*: a save that predates
 * onboarding belongs to someone who has plainly already pressed Run once, and
 * sending them back to step one would be the game forgetting, not helping.
 */
function fillGaps(state: Record<string, unknown> & GameState): void {
  const step = state['onboardingStep'];
  if (typeof step !== 'number' || !Number.isFinite(step)) {
    state.onboardingStep = ONBOARDING_DONE;
  }
  // The throughput ring buffer and its per-tick accumulator: absent in any save
  // written before instrumentation, harmless to start empty.
  if (!Array.isArray(state['history'])) state.history = [];
  if (!isRecord(state['tickProduced'])) state.tickProduced = {};

  // Every robot carries an ore-batch list; a save from before batches has none.
  for (const robot of state.robots) {
    if (!Array.isArray(robot.batches)) robot.batches = [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural check only — deep enough that the engine cannot crash on a save,
 * shallow enough that adding an optional field later does not invalidate saves.
 */
function isGameState(data: Record<string, unknown>): data is Record<string, unknown> & GameState {
  const numbers = ['version', 'tick', 'tickRateMs', 'inventoryCapacity'];
  for (const key of numbers) {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) return false;
  }

  if (typeof data['script'] !== 'string') return false;

  const arrays = ['robots', 'unlocks', 'seenConcepts'];
  for (const key of arrays) {
    if (!Array.isArray(data[key])) return false;
  }

  const grid = data['grid'];
  if (!isRecord(grid)) return false;
  if (typeof grid['width'] !== 'number' || typeof grid['height'] !== 'number') return false;
  if (!Array.isArray(grid['tiles'])) return false;
  if (grid['tiles'].length !== grid['width'] * grid['height']) return false;

  const stats = data['stats'];
  if (!isRecord(stats)) return false;
  for (const key of ['tilesMoved', 'oreMined']) {
    if (typeof stats[key] !== 'number') return false;
  }
  if (!isRecord(stats['crafted'])) return false;

  return true;
}
