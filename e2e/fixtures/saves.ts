/**
 * Save fixtures, written out by hand rather than derived from `createInitialState()`.
 *
 * That is deliberate. A migration test is only worth anything if the input is a
 * frozen record of what an old build actually wrote. Building the fixture from
 * today's code would let it drift along with the code and quietly stop testing
 * the thing it was written for.
 */

export const SAVE_KEY = 'factoryos.save';

/** `ONBOARDING_DONE` — anything at or above this keeps the coach card hidden. */
const ONBOARDING_DONE = 3;

/**
 * A version 1 save: the world before cultivation. Every tile is an ore node
 * that refilled itself, and the state carries `oreRegrowTicks` — both of which
 * describe a game that no longer exists.
 *
 * The earned progress is set to values a fresh factory could never produce, so
 * a test can tell "migrated" from "silently replaced" at a glance.
 */
export function version1Save(size = 8): Record<string, unknown> {
  return {
    version: 1,
    tick: 512,
    credits: 777,
    oreRegrowTicks: 30,
    grid: {
      width: size,
      height: size,
      tiles: Array.from({ length: size * size }, () => ({
        kind: 'ore',
        resource: 'iron_ore',
        amount: 20,
        regrowAt: null,
      })),
    },
    robots: [{ id: 'r1', x: 0, y: 0, facing: 'south', inventory: { iron_ore: 4 } }],
    unlocks: ['move', 'mine', 'print', 'sell', 'wait'],
    completedMissions: ['m1_move', 'm2_mine'],
    seenConcepts: ['while_loop'],
    onboardingStep: ONBOARDING_DONE,
    stats: {
      tilesMoved: 340,
      oreMined: 95,
      creditsEarned: 1500,
      itemsSold: 42,
      crafted: { iron_ingot: 8 },
    },
    script: '// a script from before cultivation\nawait move("south");',
    tickRateMs: 400,
    inventoryCapacity: 20,
  };
}

/** A tile of untouched floor, the shape cultivation writes. */
function rawGround(): Record<string, unknown> {
  return { kind: 'ground', state: 'raw', resource: null, ripeAt: null, yield: 0, purity: 0 };
}

/**
 * A current save: bare ground, one robot in the middle of it.
 *
 * The robot carries seed crystals because `seed()` spends one (commands.ts) —
 * without them a cultivation script fails on its first plant with a message
 * about the seeder, which is a confusing way for a test to go red.
 *
 * `tickRateMs` is deliberately tiny so a test that waits out a crop finishes in
 * well under a second.
 */
export function currentSave(script: string, size = 8): Record<string, unknown> {
  return {
    version: 6,
    tick: 0,
    grid: {
      width: size,
      height: size,
      tiles: Array.from({ length: size * size }, () => rawGround()),
    },
    robots: [{ id: 'r1', x: 4, y: 4, facing: 'south', inventory: { seed_crystal: 2 }, batches: [] }],
    unlocks: ['move', 'mine', 'print', 'scan', 'cultivate'],
    history: [],
    tickProduced: {},
    seenConcepts: [],
    onboardingStep: ONBOARDING_DONE,
    stats: { tilesMoved: 0, oreMined: 0, crafted: {} },
    script,
    modules: [],
    tickRateMs: 20,
    inventoryCapacity: 20,
  };
}
