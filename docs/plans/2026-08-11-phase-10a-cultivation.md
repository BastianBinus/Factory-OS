# Phase 10a — Cultivation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the self-refilling ore nodes with ground the player has to clear, seed, wait for and harvest, so that resources come from a cycle the script drives rather than from a world that refills itself.

**Architecture:** A single new tile kind, `GroundTile`, carries a four-state machine (`raw → prepared → growing → ripe → raw`). The state transitions live in a new pure module `src/game/cultivation.ts`; the verbs `clear()`, `seed()` and the rewritten `mine()` live in `src/engine/commands.ts` and do nothing but validate and call into it. Ripening happens once per tick inside `advanceWorld()`, in the same place machine jobs finish. `regrowOre()` is deleted outright — nothing in the world produces anything for free any more.

**Tech Stack:** Vite + vanilla TypeScript (strict), Vitest, Three.js for the renderer. No UI framework. Game rules in `src/game/`, engine in `src/engine/`, worker API in `src/worker/`, renderer in `src/render/`.

**Source spec:** `docs/specs/2026-08-11-gameplay-loop-redesign.md`, sections 4, 6, 9 and 10a.

---

## Decisions that override the spec

These were found while reading the code against the spec. All three are settled — build them as written here, not as the spec says.

**1. `mine()` returns a seed crystal along with the harvest.** Spec §4 has `seed()` consume a crystal and crystals come only from the Seeder, which needs the paid `drop`/`craft`/`take` unlocks — a new player would soft-lock with no crystal and no way to make one. So harvesting a ripe tile yields the crop **plus one `seed_crystal`**. Replanting the tile you just harvested is net-zero. Growing the *field* costs crystals crafted from ore (2 iron ore → 1 crystal in the Seeder), which is the reinvestment arm §3 asks for.

**2. Two version bumps, not one.** Spec §9 folds `credits → iron_ore` into the same v1→v2 migration as the tile model. But 10a keeps credits (10b deletes them), so converting now would strip the player's purchasing power while the shop still prices in credits. **10a bumps `SAVE_VERSION` to 2 and only rebuilds the grid. 10b bumps to 3 and converts the currency.**

**3. The migrated grid is rebuilt from `INITIAL_LAYOUT`, not blanked.** Spec §9 says "grid regenerated at the same size, every tile ground/raw". That would hand the player back a factory with no ripe tile, no crystal and no machines — unplayable. Instead the migration does exactly what `resetWorld()` does: `expandGrid(gridFromLayout(INITIAL_LAYOUT), size)`.

**4. `if_else` moves from `scan` to `scan_at`; `objects` moves from `scan_at` to `robot_2`.** `scan` becomes a starting command in this phase, and `showNewConcepts()` silently marks the concepts of starting unlocks as seen at boot — so `if_else` would never fire a panel again. `me()` returning `{ id, index }` is a better example for `objects` than `scanAt` was anyway.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/game/cultivation.ts` | The ground state machine as pure functions: which resources are seedable, how long they take, the adjacency yield, purity, and the per-tick ripening sweep. No I/O, no command plumbing. Exists so `commands.ts` does not keep growing. |
| `tests/cultivation.test.ts` | Direct unit tests for the above. |

**Modified files**

| File | What changes |
|---|---|
| `src/game/types.ts` | Add `GroundState`, `GroundTile`, `'seeder'` to `MachineId`, `'seed_crystal'` to `ResourceId`, `'cultivate'` to `UnlockId`. Later remove `FloorTile`, `OreTile`, `GameState.oreRegrowTicks`. |
| `src/game/resources.ts` | A `seed_crystal` row. |
| `src/game/recipes.ts` | A `craft_seed_crystal` recipe on the seeder. |
| `src/game/cultivation.ts` | (new, see above) |
| `src/game/grid.ts` | Delete `regrowOre()` and `mulberry32()`. `expandGrid(grid, size)` loses its `oreAmount` parameter and fills new land with raw ground. |
| `src/game/GameState.ts` | New `INITIAL_LAYOUT` with three ripe tiles and a seeder, `SAVE_VERSION = 2`, `STARTING_UNLOCKS` gains `scan` and `cultivate`, drop `ORE_NODE_AMOUNT` and `DEFAULT_REGROW_TICKS`, new `STARTER_SCRIPT`. |
| `src/game/saveLoad.ts` | `MIGRATIONS[1]`, and `oreRegrowTicks` out of `isGameState`. |
| `src/game/progression.ts` | `scan` becomes free, the new `cultivate` unlock, concept re-hanging, `addRobot` looks for ground. |
| `src/engine/commands.ts` | New `clear()` and `seed()`, rewritten `mine()`, `describeTile()` learns ground, `advanceWorld()` ripens instead of regrowing. |
| `src/engine/dispatch.ts` | Register `clear` and `seed`. |
| `src/render/palette.ts` | `groundPrepared` and `seedCrystal` palette keys. |
| `src/render/meshFactory.ts` | `createGround()`, a seeder mesh, two new geometries, a `groundPrepared` material, a `seed_crystal` ore material. |
| `src/render/WorldView.ts` | Build and sync ground views; `gridSignature()` collapses every ground state to one character so growth never triggers a static rebuild. |
| `src/style/tokens.css` | `--w-ground-prepared` and `--w-seed-crystal`, light and dark. |
| `src/ui/Editor.ts` | Autocomplete entries for `clear()` and `seed()`. |
| `src/main.ts` | The hover tooltip describes ground. |
| `tests/helpers.ts` | `oreAt` → `groundAt`. |
| `tests/*.test.ts` | Six suites are written against the old tile model; each is fixed in Task 8, the task that actually invalidates them. Three more (`progression`, `concepts`, `errorHints`) assert that `scan()` is bought rather than owned; they are fixed in Task 11, which is what changes that. |

**Ordering note — read this before starting. Do not reorder.**

The old ore model is kept alive far longer than it is useful, on purpose. It is the only way each task can end with a green suite.

| Tasks | Shape |
|---|---|
| 1–7 | Purely additive. Ground and ore both exist; `mine()` and `describeTile()` handle both. Nothing that worked before stops working. Suite green after every task. |
| 8 | The world flips: no `INITIAL_LAYOUT` character and no expansion produces an ore tile any more. This invalidates six test suites, and Task 8 fixes all six in the same task. Red in the middle, green at the end. |
| 9–10 | Additive: the renderer learns two new meshes, the save gains a migration. No existing test changes meaning. |
| 11 | `scan()` stops being something you buy. That rewrites assertions in `progression`, `concepts` and `errorHints`, all three fixed inside the task. |
| 12 | The single removal sweep. `FloorTile`, `OreTile`, `regrowOre`, `mulberry32`, `ORE_NODE_AMOUNT`, `DEFAULT_REGROW_TICKS` and `GameState.oreRegrowTicks` all come out together, because by then every one of them is dead. Red in the middle, green at the end. |
| 13 | README, full suite, push. |

---

## Task 1: New types and the seed crystal resource

Purely additive. `GroundTile` joins the `Tile` union but nothing produces one yet, and `seed_crystal` joins `ResourceId` which forces three `Record<ResourceId, …>` tables to grow.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/resources.ts`
- Modify: `src/render/palette.ts`
- Modify: `src/render/meshFactory.ts`
- Modify: `src/style/tokens.css`

- [ ] **Step 1: Add the ground types to `src/game/types.ts`**

Replace the `FloorTile` and `OreTile` block (lines 16–27) by leaving both in place and inserting the new types *above* them, so nothing breaks yet:

```ts
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
```

- [ ] **Step 2: Widen the three unions in `src/game/types.ts`**

```ts
export type ResourceId =
  | 'iron_ore'
  | 'copper_ore'
  | 'iron_ingot'
  | 'copper_ingot'
  | 'gear'
  | 'seed_crystal';

export type MachineId = 'smelter' | 'assembler' | 'seeder';
```

And add `GroundTile` to the tile union (line 46), keeping the old members for now:

```ts
export type Tile = GroundTile | FloorTile | OreTile | MachineTile | MarketTile;
```

- [ ] **Step 3: Add the resource row in `src/game/resources.ts`**

Insert after the `gear` row inside `RESOURCES`:

```ts
  seed_crystal: {
    id: 'seed_crystal',
    label: 'Seed crystal',
    colorToken: 'w-seed-crystal',
    // Priced at what its inputs are worth, so selling a crystal is never a
    // loss and never a trick. sell() disappears in 10b and takes this with it.
    sellPrice: 6,
  },
```

- [ ] **Step 4: Add the two colour tokens in `src/style/tokens.css`**

In the `:root` World block, after `--w-gear: #6e7885;`:

```css
  --w-ground-prepared: #b9a48a;
  --w-seed-crystal: #7fb8a8;
```

In the dark World block, after `--w-gear: #5a636f;`:

```css
  --w-ground-prepared: #3a3227;
  --w-seed-crystal: #5c9384;
```

- [ ] **Step 5: Add the palette keys in `src/render/palette.ts`**

In `TOKENS`, after `gear: '--w-gear',`:

```ts
  groundPrepared: '--w-ground-prepared',
  seedCrystal: '--w-seed-crystal',
```

In `RESOURCE_KEYS`, after `gear: 'gear',`:

```ts
  seed_crystal: 'seedCrystal',
```

- [ ] **Step 6: Add the two materials in `src/render/meshFactory.ts`**

Add the field to `WorldMaterials` next to `gear`:

```ts
  readonly groundPrepared: MeshStandardMaterial;
```

In the constructor, after the `this.gear = …` line:

```ts
    this.groundPrepared = new MeshStandardMaterial({ color: palette.groundPrepared, ...SURFACE });
```

In `dispose()`, after `this.gear.dispose();`:

```ts
    this.groundPrepared.dispose();
```

And in the `this.ore = { … }` table, after the `gear` entry:

```ts
      seed_crystal: new MeshStandardMaterial({ color: colorFor(palette, 'seed_crystal'), ...METAL }),
```

- [ ] **Step 7: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: `Test Files 17 passed (17)`, `Tests 204 passed (204)`.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/resources.ts src/render/palette.ts src/render/meshFactory.ts src/style/tokens.css
git commit -m "feat(types): add the ground tile and the seed crystal"
```

---

## Task 2: The cultivation module

The state machine as pure functions, tested directly. Nothing calls it yet.

**Files:**
- Create: `src/game/cultivation.ts`
- Test: `tests/cultivation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cultivation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameState, Grid, GroundTile, ResourceId } from '../src/game/types';
import {
  BASE_YIELD,
  GROW_TICKS,
  isSeedable,
  neighbourBonus,
  purityFor,
  ripen,
  yieldFor,
} from '../src/game/cultivation';
import { setTile } from '../src/game/grid';
import { createInitialState } from '../src/game/GameState';

function ground(state: GroundTile['state'], resource: ResourceId | null = null): GroundTile {
  return { kind: 'ground', state, resource, ripeAt: null, yield: 0, purity: 0 };
}

function bareGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ground('raw')),
  };
}

describe('isSeedable', () => {
  it('accepts the two ores and nothing else', () => {
    expect(isSeedable('iron_ore')).toBe(true);
    expect(isSeedable('copper_ore')).toBe(true);
    expect(isSeedable('iron_ingot')).toBe(false);
    expect(isSeedable('seed_crystal')).toBe(false);
  });

  it('gives copper a longer season than iron', () => {
    expect(GROW_TICKS.copper_ore).toBeGreaterThan(GROW_TICKS.iron_ore ?? 0);
  });
});

describe('neighbourBonus', () => {
  it('counts only the four orthogonal neighbours growing the same crop', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('growing', 'iron_ore'));
    setTile(grid, 0, 1, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 1, ground('growing', 'copper_ore'));
    setTile(grid, 1, 2, ground('prepared', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(2);
  });

  it('does not count diagonals', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 0, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 2, ground('ripe', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(0);
  });

  it('treats the edge of the factory as no neighbour, not as an error', () => {
    const grid = bareGrid(1, 1);
    expect(neighbourBonus(grid, 0, 0, 'iron_ore')).toBe(0);
  });
});

describe('yieldFor', () => {
  it('pays the base yield on a lonely tile', () => {
    expect(yieldFor(bareGrid(3, 3), 1, 1, 'iron_ore')).toBe(BASE_YIELD);
  });

  it('pays one more per matching neighbour', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 1, 2, ground('ripe', 'iron_ore'));

    expect(yieldFor(grid, 1, 1, 'iron_ore')).toBe(BASE_YIELD + 2);
  });
});

describe('purityFor', () => {
  it('stays inside 1..10', () => {
    for (let tick = 0; tick < 50; tick += 1) {
      for (let x = 0; x < 8; x += 1) {
        const purity = purityFor(x, x + 1, tick);
        expect(purity).toBeGreaterThanOrEqual(1);
        expect(purity).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is deterministic in the tile and the moment', () => {
    expect(purityFor(3, 4, 12)).toBe(purityFor(3, 4, 12));
  });

  it('is not the same for every tile', () => {
    const values = new Set([purityFor(0, 0, 0), purityFor(1, 0, 0), purityFor(0, 1, 0)]);
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('ripen', () => {
  function stateWith(grid: Grid, tick: number): GameState {
    const state = createInitialState();
    state.grid = grid;
    state.tick = tick;
    return state;
  }

  it('ripens only crops whose tick has arrived', () => {
    const grid = bareGrid(2, 1);
    const early: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 10 };
    const late: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 40 };
    setTile(grid, 0, 0, early);
    setTile(grid, 1, 0, late);

    const ripened = ripen(stateWith(grid, 10));

    expect(ripened).toHaveLength(1);
    expect(early.state).toBe('ripe');
    expect(early.ripeAt).toBeNull();
    expect(late.state).toBe('growing');
  });

  it('leaves raw, prepared and already ripe ground alone', () => {
    const grid = bareGrid(3, 1);
    setTile(grid, 0, 0, ground('raw'));
    setTile(grid, 1, 0, ground('prepared'));
    setTile(grid, 2, 0, { ...ground('ripe', 'iron_ore'), yield: 3 });

    expect(ripen(stateWith(grid, 9999))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/cultivation"`.

- [ ] **Step 3: Write `src/game/cultivation.ts`**

```ts
import type { GameState, Grid, GroundTile, ResourceId } from './types';
import { tileAt } from './grid';

/**
 * The ground state machine, with no idea that commands exist.
 *
 * It lives apart from commands.ts for one reason: the verbs are thin — they
 * check whose turn it is and hand over — while the rules about what a tile is
 * worth and when it ripens are the part worth testing on its own.
 */

/** What a lonely tile hands over when it is harvested. */
export const BASE_YIELD = 3;

/** Added per orthogonal neighbour growing the same crop. */
export const ADJACENCY_BONUS = 1;

/**
 * How long each crop takes. Being in this table is what makes a resource
 * seedable at all — ingots and gears are made, not grown.
 */
export const GROW_TICKS: Partial<Record<ResourceId, number>> = {
  iron_ore: 8,
  copper_ore: 12,
};

export function isSeedable(resource: ResourceId): boolean {
  return GROW_TICKS[resource] !== undefined;
}

/**
 * Neighbours growing the same crop, counted orthogonally.
 *
 * Diagonals deliberately do not count: it makes a solid block the best shape,
 * which is a rule a player can see on the floor and reason about in a loop.
 */
export function neighbourBonus(grid: Grid, x: number, y: number, resource: ResourceId): number {
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;

  let count = 0;
  for (const [dx, dy] of offsets) {
    const tile = tileAt(grid, x + dx, y + dy);
    if (!tile || tile.kind !== 'ground') continue;
    if (tile.state !== 'growing' && tile.state !== 'ripe') continue;
    if (tile.resource !== resource) continue;
    count += 1;
  }
  return count;
}

/** Decided once, when the tile is seeded — not when it is harvested. */
export function yieldFor(grid: Grid, x: number, y: number, resource: ResourceId): number {
  return BASE_YIELD + ADJACENCY_BONUS * neighbourBonus(grid, x, y, resource);
}

/**
 * A grade from 1 to 10, deterministic in the tile and the tick it was seeded.
 *
 * Nothing in 10a reads it. It is written now so that the sorting bay in 10d,
 * which is the whole point of the mechanic, does not need its own migration.
 */
export function purityFor(x: number, y: number, tick: number): number {
  return 1 + ((x * 7 + y * 13 + tick * 31) % 10);
}

/** The one thing the world does on its own each tick. Returns what changed. */
export function ripen(state: GameState): GroundTile[] {
  const ripened: GroundTile[] = [];

  for (const tile of state.grid.tiles) {
    if (tile.kind !== 'ground' || tile.state !== 'growing') continue;
    if (tile.ripeAt === null || state.tick < tile.ripeAt) continue;
    tile.state = 'ripe';
    tile.ripeAt = null;
    ripened.push(tile);
  }

  return ripened;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, `Tests 215 passed (215)`.

- [ ] **Step 6: Commit**

```bash
git add src/game/cultivation.ts tests/cultivation.test.ts
git commit -m "feat(game): add the ground state machine"
```

---

## Task 3: The seeder recipe

**Files:**
- Modify: `src/game/recipes.ts`
- Test: `tests/recipes.test.ts` (add to the existing file)

- [ ] **Step 1: Write the failing test**

Append to `tests/recipes.test.ts`:

```ts
describe('the seeder', () => {
  it('turns two iron ore into one seed crystal', () => {
    const recipe = getRecipe('craft_seed_crystal');
    expect(recipe).toMatchObject({
      machine: 'seeder',
      inputs: { iron_ore: 2 },
      output: 'seed_crystal',
      outputAmount: 1,
    });
  });

  it('is the only thing the seeder makes', () => {
    expect(recipesFor('seeder').map((recipe) => recipe.id)).toEqual(['craft_seed_crystal']);
  });

  it('runs on ore alone, so a field can be grown without the smelter', () => {
    expect(findRunnableRecipe('seeder', { iron_ore: 2 })?.id).toBe('craft_seed_crystal');
    expect(findRunnableRecipe('seeder', { iron_ore: 1 })).toBeUndefined();
  });
});
```

If `recipesFor` or `findRunnableRecipe` are not already imported at the top of that file, add them to the existing import from `../src/game/recipes`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/recipes.test.ts`
Expected: FAIL — `expected undefined to match object`.

- [ ] **Step 3: Add the recipe**

Append to the `RECIPES` array in `src/game/recipes.ts`, after `assemble_gear`:

```ts
  {
    id: 'craft_seed_crystal',
    machine: 'seeder',
    inputs: { iron_ore: 2 },
    output: 'seed_crystal',
    outputAmount: 1,
    ticks: 3,
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/recipes.ts tests/recipes.test.ts
git commit -m "feat(recipes): craft seed crystals from ore in the seeder"
```

---

## Task 4: `clear()` and `seed()`

Two new verbs. `mine()` is left alone in this task — it still works on ore, and the suite stays green.

**Files:**
- Modify: `src/engine/commands.ts`
- Modify: `src/engine/dispatch.ts`
- Test: `tests/cultivation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/cultivation.test.ts`. Add the imports it needs at the top of the file:

```ts
import { clear, seed } from '../src/engine/commands';
import { ctxOf, expectFail, expectOk, runTick, stateFromLayout } from '../tests/helpers';
```

> Note: inside `tests/`, import helpers as `'./helpers'`, not `'../tests/helpers'`.

```ts
describe('clear', () => {
  it('turns raw ground into prepared ground', () => {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;

    expectOk(runTick(state, clear));

    expect(state.grid.tiles[4]).toMatchObject({ kind: 'ground', state: 'prepared' });
  });

  it('refuses ground that is already prepared', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;

    expectOk(runTick(state, clear));
    const result = expectFail(runTick(state, clear));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('prepared');
  });

  it('refuses a tile that is not ground at all', () => {
    const state = stateFromLayout(['M'], 0, 0);
    expect(expectFail(runTick(state, clear)).code).toBe('nothing_here');
  });
});

describe('seed', () => {
  function preparedState(): GameState {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;
    state.robots[0]!.inventory = { seed_crystal: 1 };
    expectOk(runTick(state, clear));
    return state;
  }

  it('plants a crop, spends the crystal and books the ripe tick', () => {
    const state = preparedState();

    expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(state.grid.tiles[4]).toMatchObject({
      kind: 'ground',
      state: 'growing',
      resource: 'iron_ore',
      ripeAt: state.tick + (GROW_TICKS.iron_ore ?? 0),
      yield: BASE_YIELD,
    });
    expect(state.robots[0]!.inventory.seed_crystal).toBeUndefined();
  });

  it('gives the tile a purity so the sorting bay has something to sort', () => {
    const state = preparedState();
    expectOk(runTick(state, (ctx) => seed(ctx, 'copper_ore')));

    const tile = state.grid.tiles[4] as GroundTile;
    expect(tile.purity).toBe(purityFor(1, 1, state.tick));
  });

  it('will not plant on raw ground', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    state.robots[0]!.inventory = { seed_crystal: 1 };

    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('cleared');
  });

  it('refuses a resource that cannot be grown', () => {
    const state = preparedState();
    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'gear')));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('iron_ore');
  });

  it('refuses when the robot has no crystal, and says where to get one', () => {
    const state = preparedState();
    state.robots[0]!.inventory = {};

    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(result.code).toBe('missing_input');
    expect(result.error).toContain('seeder');
  });

  it('pays the adjacency bonus at seeding time', () => {
    const state = preparedState();
    setTile(state.grid, 1, 0, { ...ground('ripe', 'iron_ore'), yield: 3 });
    setTile(state.grid, 0, 1, { ...ground('growing', 'iron_ore'), ripeAt: 99 });

    expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect((state.grid.tiles[4] as GroundTile).yield).toBe(BASE_YIELD + 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: FAIL — `"clear" is not exported by "src/engine/commands.ts"`.

- [ ] **Step 3: Add the verbs to `src/engine/commands.ts`**

Add to the imports at the top:

```ts
import { GROW_TICKS, isSeedable, purityFor, yieldFor } from '../game/cultivation';
import { isResourceId } from '../game/resources';
```

Insert both functions immediately after `move()`:

```ts
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
```

- [ ] **Step 4: Register them in `src/engine/dispatch.ts`**

Change the import line to include the two verbs:

```ts
import { clear, craft, drop, mine, move, scan, scanAt, seed, sell, take, wait } from './commands';
```

Add to `RUNNERS`, after the `move` entry:

```ts
  clear: (ctx) => clear(ctx),
  seed: (ctx, args) => seed(ctx, args[0]),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, all green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/commands.ts src/engine/dispatch.ts tests/cultivation.test.ts
git commit -m "feat(commands): add clear() and seed()"
```

---
## Task 5: Crops ripen once per tick

`ripen()` already exists and is already tested in isolation. This is the one line that makes the world call it, and the test that proves the world does.

**Files:**
- Modify: `src/engine/commands.ts`
- Test: `tests/cultivation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/cultivation.test.ts`. Add `idle` to the helper import at the top of the file, so the line reads:

```ts
import { ctxOf, expectFail, expectOk, idle, runTick, stateFromLayout } from './helpers';
```

```ts
describe('ripening inside advanceWorld', () => {
  it('turns a crop ripe on the tick it was booked for, not before', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'iron_ore'), ripeAt: 4, yield: 5 });

    idle(state, 3);
    expect(state.grid.tiles[0]).toMatchObject({ state: 'growing' });

    idle(state, 1);
    expect(state.grid.tiles[0]).toMatchObject({ state: 'ripe', ripeAt: null });
  });

  it('leaves the yield alone, so the harvest pays what seeding promised', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'copper_ore'), ripeAt: 1, yield: 5, purity: 7 });

    idle(state, 1);

    expect(state.grid.tiles[0]).toMatchObject({ state: 'ripe', yield: 5, purity: 7 });
  });

  it('does not touch ground that was never seeded', () => {
    const state = createInitialState();
    state.grid = bareGrid(2, 1);
    setTile(state.grid, 1, 0, ground('prepared'));

    idle(state, 50);

    expect(state.grid.tiles[0]).toMatchObject({ state: 'raw' });
    expect(state.grid.tiles[1]).toMatchObject({ state: 'prepared' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cultivation.test.ts -t ripening`
Expected: FAIL — the tiles stay `growing`, because nothing calls `ripen()` yet.

- [ ] **Step 3: Call `ripen()` from `advanceWorld()`**

In `src/engine/commands.ts`, add the import next to the other `../game/` imports:

```ts
import { ripen } from '../game/cultivation';
```

Then in `advanceWorld()`, add the call **next to** the existing `regrowOre` line — do not remove `regrowOre` yet, Task 12 does that:

```ts
  regrowOre(state.grid, state.tick, ORE_NODE_AMOUNT);
  ripen(state);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, all green. Nothing else changed behaviour: no tile in any existing test is `kind: 'ground'`, so `ripen()` finds nothing to do.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands.ts tests/cultivation.test.ts
git commit -m "feat(engine): ripen crops once per tick"
```

---

## Task 6: `mine()` harvests a ripe crop

`mine()` grows a second branch. Standing on ground it harvests; standing on ore it does exactly what it always did. Both branches live side by side until Task 12, which is what keeps `tests/commands.test.ts` green through this task.

The capacity rule is the subtle part: the harvest is `tile.yield` crop **plus** one seed crystal, so the robot needs `yield + 1` free slots, not `yield`. Checking for `yield` would let a full robot silently drop the crystal, and the crystal is the thing that keeps the cycle going.

**Files:**
- Modify: `src/engine/commands.ts`
- Test: `tests/cultivation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/cultivation.test.ts`. Add `mine` to the command import at the top of the file, so the line reads:

```ts
import { clear, mine, seed } from '../src/engine/commands';
```

```ts
describe('mine on cultivated ground', () => {
  function ripeState(tile: Partial<GroundTile> = {}): GameState {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    setTile(state.grid, 1, 1, { ...ground('ripe', 'iron_ore'), yield: 3, purity: 4, ...tile });
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;
    state.robots[0]!.inventory = {};
    return state;
  }

  it('hands over the whole yield in one tick, plus a seed crystal', () => {
    const state = ripeState();

    const result = expectOk(runTick(state, mine));

    expect(result.value).toBe('iron_ore');
    expect(state.robots[0]!.inventory).toEqual({ iron_ore: 3, seed_crystal: 1 });
    expect(state.stats.oreMined).toBe(3);
  });

  it('pays the yield the tile was seeded with, not a fixed number', () => {
    const state = ripeState({ yield: 6 });

    expectOk(runTick(state, mine));

    expect(state.robots[0]!.inventory).toEqual({ iron_ore: 6, seed_crystal: 1 });
  });

  /*
   * The crystal is what makes replanting free. If a harvest could arrive without
   * one because the robot happened to be nearly full, the player would lose a
   * crystal to a rounding rule they never see — so a harvest is all or nothing.
   */
  it('refuses the harvest unless there is room for the crystal too', () => {
    const state = ripeState();
    state.inventoryCapacity = 3;

    const result = expectFail(runTick(state, mine));

    expect(result.code).toBe('inventory_full');
    expect(state.robots[0]!.inventory).toEqual({});
    expect(state.grid.tiles[4]).toMatchObject({ state: 'ripe' });
  });

  it('leaves the tile raw, so the cycle has to start again', () => {
    const state = ripeState();

    expectOk(runTick(state, mine));

    expect(state.grid.tiles[4]).toEqual({
      kind: 'ground',
      state: 'raw',
      resource: null,
      ripeAt: null,
      yield: 0,
      purity: 0,
    });
  });

  it('says the crop is not ready while it is still growing', () => {
    const state = ripeState({ state: 'growing', ripeAt: 99 });

    const result = expectFail(runTick(state, mine));

    expect(result.code).toBe('not_ready');
    expect(result.error).toContain('growing');
  });

  it('says there is nothing there on raw and prepared ground', () => {
    const raw = ripeState({ state: 'raw', resource: null });
    expect(expectFail(runTick(raw, mine)).code).toBe('nothing_here');

    const prepared = ripeState({ state: 'prepared', resource: null });
    expect(expectFail(runTick(prepared, mine)).code).toBe('nothing_here');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cultivation.test.ts -t "mine on cultivated"`
Expected: FAIL with `expected success, got nothing_here: There is no ore on this tile.`

- [ ] **Step 3: Add the harvest branch to `src/engine/commands.ts`**

Widen the type import at the top of the file so it includes `GroundTile`:

```ts
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
```

Replace the whole `mine` function:

```ts
export function mine(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);

  if (tile?.kind === 'ground') return harvest(ctx, tile);

  // --- The ore path. Removed in Task 12 together with the ore tile itself. ---
  if (!tile || tile.kind !== 'ore') {
    return fail('nothing_here', 'There is no ore on this tile.');
  }
  if (tile.amount <= 0) {
    return fail('depleted', 'This ore node is empty and still regrowing.');
  }
  if (freeCapacity(ctx) <= 0) {
    return fail('inventory_full', `The robot is carrying ${totalItems(ctx.robot.inventory)} items and cannot hold more.`);
  }

  tile.amount -= 1;
  addItems(ctx.robot.inventory, tile.resource, 1);
  ctx.state.stats.oreMined += 1;

  if (tile.amount === 0) {
    tile.regrowAt = ctx.state.tick + ctx.state.oreRegrowTicks;
  }

  return ok(tile.resource, `mined ${tile.resource}`);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`. The old `mine` tests in `tests/commands.test.ts` still pass — they stand on ore tiles, which take the untouched second branch.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands.ts tests/cultivation.test.ts
git commit -m "feat(commands): harvest ripe ground with mine()"
```

---

## Task 7: `scan()` can read ground

Without this the player has no way to ask "is it ripe yet?", and the whole timing half of the game would have to be counted by hand.

**Files:**
- Modify: `src/engine/commands.ts`
- Test: `tests/cultivation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/cultivation.test.ts`. Add `scan` to the command import at the top of the file, so the line reads:

```ts
import { clear, mine, scan, seed } from '../src/engine/commands';
```

```ts
describe('scan on cultivated ground', () => {
  function scanAtOrigin(tile: GroundTile): Record<string, unknown> {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, tile);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    return expectOk(scan(ctxOf(state))).value as Record<string, unknown>;
  }

  it('describes raw ground as ground with nothing on it', () => {
    expect(scanAtOrigin(ground('raw'))).toEqual({
      type: 'ground',
      x: 0,
      y: 0,
      state: 'raw',
      resource: null,
      ripeIn: 0,
      yield: 0,
      purity: 0,
    });
  });

  /*
   * ripeIn, not ripeAt. A script that reads an absolute tick has to know the
   * current tick to do anything with it; a countdown is directly usable.
   */
  it('counts down to ripe instead of naming an absolute tick', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'copper_ore'), ripeAt: 12 });
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    state.tick = 4;

    const value = expectOk(scan(ctxOf(state))).value as Record<string, unknown>;

    expect(value).toMatchObject({ state: 'growing', resource: 'copper_ore', ripeIn: 8 });
  });

  it('reports the yield and purity a ripe tile is about to hand over', () => {
    const value = scanAtOrigin({ ...ground('ripe', 'iron_ore'), yield: 5, purity: 9 });

    expect(value).toMatchObject({ state: 'ripe', resource: 'iron_ore', yield: 5, purity: 9, ripeIn: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cultivation.test.ts -t "scan on cultivated"`
Expected: FAIL — `describeTile` falls through to its `default` branch and returns `{ type: 'floor', x: 0, y: 0 }`.

- [ ] **Step 3: Teach `describeTile()` about ground**

In `src/engine/commands.ts`, add a `case` to the switch in `describeTile()`, above the existing `case 'ore':`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cultivation.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands.ts tests/cultivation.test.ts
git commit -m "feat(commands): let scan() read cultivated ground"
```

---

## Task 8: The world becomes cultivated

This is the pivot. After it, no character in the layout and no expansion produces an ore tile, so `regrowOre()` runs every tick over a grid that has nothing for it to do. That is deliberate: the *type* stays until Task 12 so the renderer keeps compiling, but the *world* changes here.

Six test suites are written against ore and this task fixes all six. Expect a red suite in the middle of it.

**Files:**
- Modify: `src/game/GameState.ts`
- Modify: `src/game/grid.ts`
- Modify: `src/game/progression.ts:405-408`
- Modify: `tests/helpers.ts`
- Modify: `tests/grid.test.ts`
- Modify: `tests/commands.test.ts`
- Modify: `tests/onboarding.test.ts`
- Modify: `tests/fullRound.test.ts`
- Modify: `tests/resetWorld.test.ts`

- [ ] **Step 1: Rewrite the starting layout in `src/game/GameState.ts`**

Add the two cultivation imports at the top, under the existing `expandGrid` import:

```ts
import type { GameState, Grid, GroundTile, ResourceId, Robot, Tile, UnlockId } from './types';
import { expandGrid } from './grid';
import { BASE_YIELD, purityFor } from './cultivation';
```

Replace the `INITIAL_LAYOUT` block and `tileFromChar` (lines 38–69) with:

```ts
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
```

- [ ] **Step 2: Pass the coordinates through `gridFromLayout`**

In the same file, change the one line inside the inner loop of `gridFromLayout`:

```ts
      tiles.push(tileFromChar(row[x] ?? '.', x, y));
```

- [ ] **Step 3: Replace `STARTER_SCRIPT`**

Still in `src/game/GameState.ts`, replace the whole `STARTER_SCRIPT` constant:

```ts
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
```

- [ ] **Step 4: Make new land raw ground in `src/game/grid.ts`**

Delete `mulberry32()` entirely (lines 66–75) and replace `expandGrid`:

```ts
/**
 * Grows the factory floor to the south-east, keeping every existing tile at its
 * old coordinates so running scripts do not break.
 *
 * New land is raw ground and nothing else. Scattering free resources across it
 * would make buying land the reward, when the reward is meant to be the space to
 * plant more — which still has to be cleared, seeded and waited for.
 */
export function expandGrid(grid: Grid, size: number): Grid {
  if (size <= grid.width && size <= grid.height) return grid;

  const width = Math.max(size, grid.width);
  const height = Math.max(size, grid.height);
  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const existing = tileAt(grid, x, y);
      tiles.push(
        existing ?? { kind: 'ground', state: 'raw', resource: null, ripeAt: null, yield: 0, purity: 0 },
      );
    }
  }

  return { width, height, tiles };
}
```

- [ ] **Step 5: Fix the three `expandGrid` call sites**

In `src/game/GameState.ts`, inside `resetWorld`:

```ts
  state.grid = expandGrid(gridFromLayout(INITIAL_LAYOUT), size);
```

In `src/game/progression.ts`, in `applyUnlockEffect`:

```ts
    case 'grid_12':
      state.grid = expandGrid(state.grid, 12);
      break;
    case 'grid_16':
      state.grid = expandGrid(state.grid, 16);
      break;
```

`ORE_NODE_AMOUNT` is now unused in `progression.ts`; drop it from the import on line 2, leaving:

```ts
import { createRobot, grantUnlock, hasUnlock } from './GameState';
```

While you are in that file, two descriptions now lie. Fix them:

```ts
    id: 'mine',
    label: 'mine()',
    description: 'Harvest the ripe crop on the tile the robot stands on.',
```

```ts
    id: 'grid_12',
    label: 'Factory floor 12 x 12',
    description: 'Buy the neighbouring land. It arrives raw — clear it and seed it.',
```

- [ ] **Step 6: Run `tsc` to see the damage**

Run: `npx tsc --noEmit`
Expected: errors only in `tests/` (`expandGrid` called with three arguments). `src/` should be clean.

- [ ] **Step 7: Swap `oreAt` for `groundAt` in `tests/helpers.ts`**

Change the type import on line 1 and replace the `oreAt` function:

```ts
import type { CommandResult, GameState, GroundTile, MachineTile, Robot } from '../src/game/types';
```

```ts
export function groundAt(state: GameState, x: number, y: number): GroundTile {
  const tile = tileAt(state.grid, x, y);
  if (tile?.kind !== 'ground') throw new Error(`no ground at ${x},${y}`);
  return tile;
}
```

- [ ] **Step 8: Fix `tests/grid.test.ts`**

Change `emptyGrid` so it produces raw ground rather than floor:

```ts
function emptyGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({
      kind: 'ground' as const,
      state: 'raw' as const,
      resource: null,
      ripeAt: null,
      yield: 0,
      purity: 0,
    })),
  };
}
```

Leave the `ore regrowth` describe block exactly as it is — `regrowOre` is still live code until Task 12.

Replace the whole `expandGrid` describe block. The determinism test goes with it: there is no randomness left to be deterministic about, and a test that asserts two identical inputs give identical outputs of a pure function with no random source proves nothing.

```ts
describe('expandGrid', () => {
  it('keeps every existing tile at its old coordinates', () => {
    const grid = emptyGrid(4, 4);
    const market = { kind: 'market' as const };
    setTile(grid, 0, 0, market);
    setTile(grid, 3, 3, {
      kind: 'ground',
      state: 'ripe',
      resource: 'copper_ore',
      ripeAt: null,
      yield: 7,
      purity: 2,
    });

    const bigger = expandGrid(grid, 8);

    expect(bigger.width).toBe(8);
    expect(bigger.height).toBe(8);
    expect(bigger.tiles).toHaveLength(64);
    expect(tileAt(bigger, 0, 0)).toBe(market);
    expect(tileAt(bigger, 3, 3)).toMatchObject({ kind: 'ground', state: 'ripe', yield: 7 });
  });

  // Land is space to plant in, not a pile of free resources.
  it('fills the new land with raw ground and nothing else', () => {
    const bigger = expandGrid(emptyGrid(4, 4), 12);

    expect(bigger.tiles).toHaveLength(144);
    expect(
      bigger.tiles.every((tile) => tile.kind === 'ground' && tile.state === 'raw'),
    ).toBe(true);
  });

  it('returns the same grid when the target size is not bigger', () => {
    const grid = emptyGrid(8, 8);
    expect(expandGrid(grid, 8)).toBe(grid);
  });
});
```

Remove `OreTile` from the type import only if the `ore regrowth` block no longer needs it — it does need it, so leave line 2 alone.

- [ ] **Step 9: Fix `tests/commands.test.ts`**

`LAYOUT` is unchanged (`'M.I.'` / `'..S.'` / `'..A.'` / `'.C..'`), but `I` and `C` now mean ripe ground.

Replace the import block at the top (lines 1–14):

```ts
import { describe, expect, it } from 'vitest';
import { clear, craft, drop, mine, move, scan, scanAt, seed, sell, take } from '../src/engine/commands';
import { BASE_YIELD, purityFor } from '../src/game/cultivation';
import {
  ctxOf,
  expectFail,
  expectOk,
  groundAt,
  idle,
  machineAt,
  robotOf,
  runTick,
  stateFromLayout,
} from './helpers';
```

Replace the whole `describe('mine', …)` block (lines 59–104). The detailed harvest rules are covered in `tests/cultivation.test.ts`; what is left here is the two things only this layout can show.

```ts
describe('mine', () => {
  it('harvests the ripe patch the layout put there', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);

    expectOk(runTick(state, mine));

    expect(robotOf(state).inventory).toEqual({ iron_ore: BASE_YIELD, seed_crystal: 1 });
    expect(groundAt(state, 2, 0).state).toBe('raw');
    expect(state.stats.oreMined).toBe(BASE_YIELD);
  });

  it('fails on ground with nothing planted on it', () => {
    const state = stateFromLayout(LAYOUT, 1, 1);
    expect(expectFail(runTick(state, mine)).code).toBe('nothing_here');
  });

  it('comes back around: harvest, clear, seed, wait, harvest again', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);
    state.inventoryCapacity = 50;

    expectOk(runTick(state, mine));
    expectOk(runTick(state, clear));
    expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));
    idle(state, 8);

    expectOk(runTick(state, mine));

    // Two harvests of iron; the crystal from the first one paid for the seeding.
    expect(robotOf(state).inventory).toEqual({ iron_ore: BASE_YIELD * 2, seed_crystal: 1 });
  });
});
```

Replace the first test of `describe('scan', …)` (lines 240–249):

```ts
  it('describes the tile under the robot', () => {
    const state = stateFromLayout(LAYOUT, 2, 0);
    expect(expectOk(runTick(state, scan)).value).toEqual({
      type: 'ground',
      x: 2,
      y: 0,
      state: 'ripe',
      resource: 'iron_ore',
      ripeIn: 0,
      yield: BASE_YIELD,
      purity: purityFor(2, 0, 0),
    });
  });
```

Everything else in the file (`move`, `drop`, `craft and take`, `sell`, the other three `scan` tests) is untouched.

- [ ] **Step 10: Fix `tests/onboarding.test.ts`**

Replace the second `describe` block (lines 52–77):

```ts
/**
 * The starting position is not the middle of the floor, and the comment on
 * `startPosition` explains why. This is the half of that promise a comment cannot
 * keep: the tutorial hands the player a script that walks south and harvests, so
 * there has to be a ripe patch south of where they start. Move the robot or move
 * that patch and a brand new player's very first script walks into bare ground.
 */
describe('the starting floor answers the starter script', () => {
  it('has a ripe patch somewhere south of the robot, within reach', () => {
    const state = createInitialState();
    const start = robotOf(state);
    const steps = state.grid.height - 1 - start.y;

    let harvested = false;
    for (let i = 0; i < steps && !harvested; i += 1) {
      expectOk(runTick(state, (ctx) => move(ctx, 'south')));

      const robot = robotOf(state);
      const tile = tileAt(state.grid, robot.x, robot.y);
      if (tile?.kind !== 'ground' || tile.state !== 'ripe') continue;
      expectOk(runTick(state, mine));
      harvested = true;
    }

    expect(harvested, 'walking south from the start reaches no ripe patch').toBe(true);
  });
});
```

- [ ] **Step 11: Fix `tests/fullRound.test.ts`**

Replace the whole file. The coordinates and the arithmetic both move, so a partial edit is more error-prone than a rewrite.

```ts
import { describe, expect, it } from 'vitest';
import { clear, craft, drop, mine, seed, sell, take } from '../src/engine/commands';
import { createInitialState, hasUnlock } from '../src/game/GameState';
import { GROW_TICKS } from '../src/game/cultivation';
import { buyUnlock, evaluateMissions } from '../src/game/progression';
import { deserialize, serialize } from '../src/game/saveLoad';
import { expectOk, idle, machineAt, robotOf, runTick, stateFromLayout, walkTo } from './helpers';

/**
 * The acceptance test for the rules: one complete production round played
 * entirely through function calls — no DOM, no worker, no renderer.
 *
 * Coordinates come from INITIAL_LAYOUT in GameState.ts:
 *   market (0,0) · ripe iron (1,1) and (1,6) · ripe copper (6,6)
 *   smelter (3,3) · assembler (4,3) · seeder (2,4)
 */
describe('a full production round', () => {
  it('harvests, smelts, assembles, sells and buys an upgrade', () => {
    const state = createInitialState();
    expect(robotOf(state)).toMatchObject({ x: 1, y: 1 });

    // 1 — the robot starts standing on a ripe iron patch
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ iron_ore: 3, seed_crystal: 1 });

    // 2 — copper from the south-east corner
    walkTo(state, 6, 6);
    expectOk(runTick(state, mine));
    expect(robotOf(state).inventory).toEqual({ iron_ore: 3, copper_ore: 3, seed_crystal: 2 });

    // 3 — load the smelter and run it six times
    walkTo(state, 3, 3);
    expectOk(runTick(state, drop));
    expect(machineAt(state, 3, 3).input).toEqual({ iron_ore: 3, copper_ore: 3 });

    for (let run = 0; run < 6; run += 1) {
      expectOk(runTick(state, craft));
      idle(state, 4);
    }

    expect(machineAt(state, 3, 3).input).toEqual({});
    expect(machineAt(state, 3, 3).output).toEqual({ iron_ingot: 3, copper_ingot: 3 });

    // The crystals stay in the robot: the smelter has no recipe that takes them.
    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({
      iron_ingot: 3,
      copper_ingot: 3,
      seed_crystal: 2,
    });

    // 4 — assemble one gear
    walkTo(state, 4, 3);
    expectOk(runTick(state, drop));
    expectOk(runTick(state, craft));
    expect(machineAt(state, 4, 3).job).toMatchObject({ recipeId: 'assemble_gear' });

    idle(state, 8);
    expectOk(runTick(state, take));
    expect(robotOf(state).inventory).toEqual({ gear: 1, seed_crystal: 2 });
    expect(state.stats.crafted).toEqual({ iron_ingot: 3, copper_ingot: 3, gear: 1 });

    // 5 — sell it, crystals included: 40 for the gear, 6 each for the crystals
    walkTo(state, 0, 0);
    expect(expectOk(runTick(state, sell)).value).toBe(52);
    expect(state.credits).toBe(52);
    expect(robotOf(state).inventory).toEqual({});

    // 6 — the round was long enough to finish the first mission
    expect(state.stats.tilesMoved).toBe(24);
    const completed = evaluateMissions(state);
    expect(completed.map((entry) => entry.mission.id)).toEqual(['m1_move']);
    expect(hasUnlock(state, 'sell')).toBe(true);
    expect(state.credits).toBe(92);

    // 7 — spend the earnings
    expect(buyUnlock(state, 'wait').ok).toBe(true);
    expect(state.credits).toBe(12);
    expect(hasUnlock(state, 'wait')).toBe(true);

    // 8 — and the whole thing survives a save/load cycle
    const reloaded = deserialize(serialize(state));
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.state).toEqual(state);
  });

  /*
   * The other half of the loop, and the point of the whole phase: production is
   * open-ended only for as long as the robot puts a crop back. Replanting the
   * tile it just harvested is exactly free — one crystal out, one crystal in.
   */
  it('keeps producing for as long as the robot replants', () => {
    const state = stateFromLayout(['I.', 'M.'], 0, 0);
    state.inventoryCapacity = 50;

    for (let round = 0; round < 3; round += 1) {
      expectOk(runTick(state, mine));
      expectOk(runTick(state, clear));
      expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

      // Harvesting early is refused, which is what makes the wait real.
      expect(runTick(state, mine).ok).toBe(false);
      idle(state, GROW_TICKS.iron_ore ?? 0);
    }

    expect(robotOf(state).inventory).toEqual({ iron_ore: 9 });
    expect(state.stats.oreMined).toBe(9);
  });
});
```

- [ ] **Step 12: Fix `tests/resetWorld.test.ts`**

Change the type import on line 6 (drop `OreTile`) and add the cultivation import:

```ts
import type { GameState, MachineTile } from '../src/game/types';
import { BASE_YIELD } from '../src/game/cultivation';
import { groundAt } from './helpers';
```

Replace `messUpTheFloor` (lines 8–29):

```ts
/** Plays a few turns so there is something to undo. */
function messUpTheFloor(state: GameState): void {
  const robot = state.robots[0];
  if (!robot) throw new Error('the initial state should have a robot');

  // The robot starts on a ripe patch; harvesting it leaves the tile raw.
  mine({ state, robot });
  move({ state, robot }, 'south');

  state.tick = 412;
  state.credits = 1340;
  state.unlocks.push('sell');
  state.completedMissions.push('m1_move');
  state.stats.oreMined = 3;

  const smelter = state.grid.tiles.find((tile) => tile.kind === 'machine') as MachineTile;
  smelter.input = { iron_ore: 3 };
  smelter.output = { iron_ingot: 1 };
  smelter.job = { recipeId: 'iron_ingot', readyAt: 500 };
}
```

Replace the `refills every ore node` test (lines 46–59):

```ts
  it('puts the harvested starting patches back', () => {
    const state = createInitialState();
    messUpTheFloor(state);
    expect(groundAt(state, 1, 1).state).toBe('raw');

    resetWorld(state);

    expect(groundAt(state, 1, 1)).toMatchObject({
      state: 'ripe',
      resource: 'iron_ore',
      yield: BASE_YIELD,
    });
    expect(groundAt(state, 6, 6).resource).toBe('copper_ore');
  });
```

In `keeps everything the player earned`, the stat is now 3, not 2:

```ts
    expect(state.stats.oreMined).toBe(3);
```

In `keeps a bought grid upgrade and rebuilds it identically`, drop the third argument:

```ts
    state.grid = expandGrid(state.grid, 12);
```

- [ ] **Step 13: Run everything**

Run: `npx tsc --noEmit`
Expected: exit code 0.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, all green.

If `fullRound` fails on a credit or tile count, do not adjust the number to match the output — re-count the route by hand against `INITIAL_LAYOUT` first. `walkTo` moves along x before y, and that is what makes 24 the right number.

- [ ] **Step 14: Commit**

```bash
git add src/game/GameState.ts src/game/grid.ts src/game/progression.ts tests/
git commit -m "feat(world): plant the starting factory instead of scattering ore"
```

---
## Task 9: The renderer draws ground and the seeder

Nothing in this repository tests three.js — there is no jsdom canvas and no snapshot renderer, and adding one for four meshes would be a bigger change than the meshes. This task is therefore verified by `tsc` plus a scripted look at the running dev server. That is the honest boundary, not an oversight.

Two things go wrong if this task is skipped: the seeder placed in Task 8 renders as nothing at all (`buildTile` returns `null` for a kind it does not know), and the whole cultivation cycle is invisible.

**Files:**
- Modify: `src/render/meshFactory.ts`
- Modify: `src/render/WorldView.ts`
- Modify: `src/main.ts:733-745`

- [ ] **Step 1: Add the three geometries**

In `src/render/meshFactory.ts`, inside `class WorldGeometry`, after `readonly oreChunk = …`:

```ts
  readonly groundSlab = chamferedBox(0.7, 0.03, 0.7, 0.06, 0.012);
```

And after `readonly assemblerGear = …`:

```ts
  readonly seederHopper = chamferedBox(0.44, 0.4, 0.44, 0.1, 0.03);
  readonly seederSpout = chamferedBox(0.16, 0.22, 0.16, 0.04, 0.02);
```

`WorldGeometry.dispose()` walks `Object.values(this)` and disposes anything that is a `BufferGeometry`, so all three are freed without touching that method.

- [ ] **Step 2: Add `GroundView` and `createGround()`**

In `src/render/meshFactory.ts`, directly after `createOre()` (which stays until Task 12):

```ts
export interface GroundView {
  group: Group;
  /** Redraws for the tile's current state. Only toggles and rescales — no allocation. */
  setState(state: GroundState, resource: ResourceId | null): void;
}

/**
 * One of these exists for every ground tile on the floor, which at 16x16 means
 * 256 groups. That is the price of the four-state cycle being visible; if it
 * ever shows up in a frame profile, the fix is one InstancedMesh per state, not
 * a cheaper tile.
 *
 * It reuses the ore chunk and its four fixed positions on purpose: a harvest and
 * a mined node should look like the same substance, because they are.
 */
export function createGround(geometry: WorldGeometry, materials: WorldMaterials): GroundView {
  const group = new Group();

  // Tilled soil. Flat enough that the checkerboard still reads underneath it.
  const slab = new Mesh(geometry.groundSlab, materials.groundPrepared);
  slab.receiveShadow = true;
  slab.position.y = 0.005;
  group.add(slab);

  const crops: Mesh[] = [];
  for (const chunk of ORE_CHUNKS) {
    const mesh = solid(geometry.oreChunk, materials.ore.iron_ore);
    mesh.position.set(chunk.x, 0.02, chunk.z);
    mesh.rotation.y = chunk.rotation;
    group.add(mesh);
    crops.push(mesh);
  }

  return {
    group,
    setState(state, resource) {
      slab.visible = state !== 'raw';

      // Two half-sized chunks while it grows, four full ones when it is ripe:
      // the tile says at a glance whether walking over there is worth a tick.
      const shown = state === 'ripe' ? crops.length : state === 'growing' ? 2 : 0;
      const scale = state === 'ripe' ? 1 : 0.5;
      const material = resource === null ? materials.ore.iron_ore : materials.ore[resource];

      crops.forEach((mesh, index) => {
        mesh.visible = index < shown;
        if (!mesh.visible) return;
        mesh.material = material;
        mesh.scale.setScalar((ORE_CHUNKS[index]?.scale ?? 1) * scale);
      });
    },
  };
}
```

Widen the type import at the top of the file so `GroundState` resolves:

```ts
import type { GroundState, MachineId, ResourceId } from '../game/types';
```

- [ ] **Step 3: Add the seeder mesh**

Still in `src/render/meshFactory.ts`, replace `createMachine()` with an exhaustive switch:

```ts
export function createMachine(
  geometry: WorldGeometry,
  materials: WorldMaterials,
  machine: MachineId,
): MachineView {
  switch (machine) {
    case 'smelter':
      return createSmelter(geometry, materials);
    case 'assembler':
      return createAssembler(geometry, materials);
    case 'seeder':
      return createSeeder(geometry, materials);
  }
}
```

And add `createSeeder` after `createAssembler`:

```ts
/**
 * A hopper with a stirrer and a spout aimed at the floor. It borrows the
 * assembler's gear rather than owning a shape of its own — the two machines are
 * meant to read as the same family of thing.
 */
function createSeeder(geometry: WorldGeometry, materials: WorldMaterials): MachineView {
  const group = new Group();

  const base = solid(geometry.machineBase, materials.metalDark);

  const hopper = solid(geometry.seederHopper, materials.metal);
  hopper.position.y = 0.34;

  const spout = solid(geometry.seederSpout, materials.accent);
  spout.position.set(0, 0.1, 0.28);

  const stirrer = solid(geometry.assemblerGear, materials.gear);
  stirrer.position.y = 0.76;

  group.add(base, hopper, spout, stirrer);

  let busy = false;
  return {
    group,
    setBusy(next) {
      busy = next;
    },
    animate(delta) {
      // Slower than the assembler: this one is grinding, not cutting.
      if (busy) stirrer.rotation.y += delta * 2.5;
    },
  };
}
```

- [ ] **Step 4: Build and sync ground views in `src/render/WorldView.ts`**

Widen the two imports at the top:

```ts
import type { GameState, Grid, MachineId, Robot, Tile } from '../game/types';
```

```ts
import type { GroundView, MachineView, OreView } from './meshFactory';
import {
  WorldGeometry,
  WorldMaterials,
  createGround,
  createMachine,
  createMarket,
  createOre,
  createRobot,
} from './meshFactory';
```

Add the field to `TileView`:

```ts
interface TileView {
  ground?: GroundView;
  ore?: OreView;
  machine?: MachineView;
  group: Group;
}
```

Add a case to `buildTile()`, above `case 'ore':`:

```ts
      case 'ground': {
        const ground = createGround(this.geometry, this.materials);
        return { ground, group: ground.group };
      }
```

And a line to `syncTiles()`, above the `'ore'` line:

```ts
      if (tile.kind === 'ground') view.ground?.setState(tile.state, tile.resource);
```

- [ ] **Step 5: Stop growth from rebuilding the world every tick**

`sync()` rebuilds the entire static layer whenever `gridSignature()` changes. If a ripening crop changed the signature, every tick would dispose and recreate hundreds of meshes. Replace `gridSignature()` at the bottom of `src/render/WorldView.ts`:

```ts
const MACHINE_MARK: Record<MachineId, string> = {
  smelter: 's',
  assembler: 'a',
  seeder: 'd',
};

/**
 * Cheap way to notice a rebuild is needed: size plus what sits on every tile.
 *
 * Every ground state maps to the same character deliberately. A tile going from
 * prepared to growing to ripe is a change the *views* handle in `syncTiles`; if
 * it changed the signature instead, the whole floor would be torn down and
 * rebuilt on the tick a single crop came in.
 */
function gridSignature(grid: Grid): string {
  const kinds = grid.tiles
    .map((tile) => {
      if (tile.kind === 'ground') return '.';
      if (tile.kind === 'ore') return tile.resource === 'iron_ore' ? 'i' : 'c';
      if (tile.kind === 'machine') return MACHINE_MARK[tile.machine];
      return tile.kind === 'market' ? 'm' : '.';
    })
    .join('');
  return `${grid.width}x${grid.height}:${kinds}`;
}
```

- [ ] **Step 6: Describe ground in the hover tooltip**

In `src/main.ts`, widen the type import on line 5:

```ts
import type { GameState, GroundTile, UnlockId } from './game/types';
```

Replace `describeHoveredTile()` (lines 733–745):

```ts
function describeHoveredTile(info: HoverInfo): string {
  const tile = info.tile;
  switch (tile.kind) {
    case 'ground':
      return describeGround(tile);
    case 'ore':
      return `${tile.resource} (${tile.amount})`;
    case 'machine':
      return tile.job === null ? tile.machine : `${tile.machine}, running`;
    case 'market':
      return 'market';
    default:
      return 'floor';
  }
}

function describeGround(tile: GroundTile): string {
  switch (tile.state) {
    case 'raw':
      return 'raw ground — clear() it';
    case 'prepared':
      return 'prepared — seed() it';
    case 'growing':
      return `${tile.resource ?? 'crop'}, growing`;
    case 'ripe':
      return `${tile.resource ?? 'crop'}, ripe (${tile.yield})`;
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`. Nothing here is under test, so nothing should move.

- [ ] **Step 8: Look at it**

Run: `npm run dev` and open the printed URL.

Check all six, in order:

1. Three tiles carry four ore chunks each — (1,1), (1,6) iron and (6,6) copper. Everything else is bare floor.
2. Three machines stand at (3,3), (4,3) and (2,4). The one at (2,4) is the seeder: a boxy hopper with a gear on top and a small glowing spout at the front. It is clearly a machine and clearly not the assembler.
3. Hovering a bare tile says `raw ground — clear() it`. Hovering (1,1) says `iron_ore, ripe (3)`.
4. Paste into the editor and run:
   ```js
   await clear();
   await seed('iron_ore');
   ```
   The tile under the robot turns into a flat soil slab, then grows two small chunks, and eight ticks later becomes four full-size chunks. Hover it at each stage and confirm the tooltip agrees with what you see.
5. While that runs, the rest of the floor does not flicker. A flicker means the signature is still changing — go back to Step 5.
6. Switch the theme with the toggle. The soil and the crops recolour with everything else and the factory does not go black.

- [ ] **Step 9: Commit**

```bash
git add src/render/meshFactory.ts src/render/WorldView.ts src/main.ts
git commit -m "feat(render): draw cultivated ground and the seeder"
```

---

## Task 10: The save migration

A save written yesterday has `kind: 'ore'` on a third of its tiles and a `floor` under everything else. Loaded as-is it would produce a factory where `mine()` works, `clear()` fails on every tile, and no crop can ever be planted — playable enough to look like a bug rather than an old save.

**Files:**
- Modify: `src/game/saveLoad.ts`
- Modify: `src/game/GameState.ts`
- Test: `tests/saveLoad.test.ts`

- [ ] **Step 1: Write the failing test**

Two edits to `tests/saveLoad.test.ts`.

First, **delete line 146** from the test `fills in everything a pre-versioning save is missing`:

```ts
    expect(result.state.oreRegrowTicks).toBe(30);
```

It is not a cosmetic deletion. `MIGRATIONS[1]` removes `oreRegrowTicks`, so a version 0 save now runs migration 0 (which adds it) and then migration 1 (which takes it away again). The field is genuinely gone by the time the test looks, and asserting `30` would be asserting that the migration did not run.

Second, append a new `describe` block to the end of the file:

```ts
describe('the cultivation migration', () => {
  /** A save exactly as version 1 wrote them: ore nodes, floor, oreRegrowTicks. */
  function version1Save(size: number): Record<string, unknown> {
    const data = savedState();
    data['version'] = 1;
    data['oreRegrowTicks'] = 30;
    data['grid'] = {
      width: size,
      height: size,
      tiles: Array.from({ length: size * size }, () => ({
        kind: 'ore',
        resource: 'iron_ore',
        amount: 20,
        regrowAt: null,
      })),
    };
    return data;
  }

  it('rebuilds the factory floor when a save predates cultivation', () => {
    const result = deserialize(JSON.stringify(version1Save(12)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(1);

    const grid = result.state.grid;
    expect(grid.width).toBe(12);
    expect(grid.tiles).toHaveLength(144);

    // Phrased as an absence rather than a count, so that deleting the ore tile
    // type in Task 12 leaves this assertion saying exactly what it says now.
    expect(grid.tiles.map((tile) => tile.kind)).not.toContain('ore');

    // The floor has to come back whole: three machines, a market, and something
    // ripe to harvest. A grid of bare raw ground would be a save nobody can play.
    expect(grid.tiles.filter((tile) => tile.kind === 'machine')).toHaveLength(3);
    expect(grid.tiles.filter((tile) => tile.kind === 'market')).toHaveLength(1);
    expect(
      grid.tiles.filter((tile) => tile.kind === 'ground' && tile.state === 'ripe'),
    ).toHaveLength(3);
  });

  it('keeps the grid at the size the player paid for', () => {
    const result = deserialize(JSON.stringify(version1Save(8)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.grid.width).toBe(8);
    expect(result.state.grid.tiles).toHaveLength(64);
  });

  it('takes the floor and nothing else', () => {
    const data = version1Save(8);
    data['credits'] = 4200;
    data['unlocks'] = ['move', 'mine', 'print', 'sell'];
    data['completedMissions'] = ['m1_move'];
    data['stats'] = {
      tilesMoved: 40,
      oreMined: 25,
      creditsEarned: 900,
      itemsSold: 12,
      crafted: { gear: 2 },
    };

    const result = deserialize(JSON.stringify(data));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.credits).toBe(4200);
    expect(result.state.completedMissions).toEqual(['m1_move']);
    expect(result.state.stats.crafted).toEqual({ gear: 2 });
  });

  it('leaves a save written by this build alone', () => {
    const result = deserialize(serialize(createInitialState()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/saveLoad.test.ts`
Expected: FAIL — `the cultivation migration` reports `expected 12 to be 1` on `migratedFrom`, because `SAVE_VERSION` is still 1 and nothing migrates.

- [ ] **Step 3: Bump the save version**

In `src/game/GameState.ts`:

```ts
export const SAVE_VERSION = 2;
```

- [ ] **Step 4: Write the migration**

In `src/game/saveLoad.ts`, extend the import from `./GameState` so it also brings in the layout and the builder:

```ts
import {
  DEFAULT_CAPACITY,
  DEFAULT_REGROW_TICKS,
  DEFAULT_TICK_RATE_MS,
  INITIAL_LAYOUT,
  ONBOARDING_DONE,
  SAVE_VERSION,
  STARTER_SCRIPT,
  STARTING_UNLOCKS,
  createInitialState,
  gridFromLayout,
} from './GameState';
```

Add `expandGrid` next to the existing storage import:

```ts
import { expandGrid } from './grid';
```

Then add the new entry to `MIGRATIONS`, after the `0:` entry:

```ts
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
```

`isRecord` is a hoisted function declaration further down the file, so calling it from here is fine.

- [ ] **Step 5: Stop demanding a field the migration removes**

Still in `src/game/saveLoad.ts`, in `isGameState()`, drop `oreRegrowTicks` from the required numbers:

```ts
  const numbers = ['version', 'tick', 'credits', 'tickRateMs', 'inventoryCapacity'];
```

Without this, every migrated save fails validation and the player is silently handed a brand new factory. It is the one line in this task that turns a working migration into data loss.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/saveLoad.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`.

- [ ] **Step 7: Prove it against a real save**

Run: `npm run dev`, open the app, then in the browser console:

```js
localStorage.setItem('factoryos.save', JSON.stringify({
  ...JSON.parse(localStorage.getItem('factoryos.save')),
  version: 1,
  oreRegrowTicks: 30,
}));
location.reload();
```

Expected: the factory loads, the three ripe patches and the seeder are there, and the console shows no save error. A "starting a new factory" toast means Step 5 was skipped.

- [ ] **Step 8: Commit**

```bash
git add src/game/GameState.ts src/game/saveLoad.ts tests/saveLoad.test.ts
git commit -m "feat(save): migrate pre-cultivation saves to the new floor"
```

---

## Task 11: `scan()`, `clear()` and `seed()` reach the player

Everything built so far is unreachable from a script. `clear` and `seed` are in the dispatch table but no unlock grants them, and `scan` still costs 120 credits behind a mission — which in a game about *deciding whether a tile is ripe* is a paywall in front of the tutorial.

This also re-hangs two concepts. `showNewConcepts()` marks the concepts of starting unlocks as seen at boot, so leaving `if_else` on `scan` would mean the panel that teaches conditions never opens again for anyone.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/progression.ts`
- Modify: `src/game/GameState.ts`
- Modify: `src/game/concepts.ts:46-58`
- Modify: `src/ui/Editor.ts:32-54`
- Test: `tests/progression.test.ts`
- Test: `tests/concepts.test.ts`
- Test: `tests/errorHints.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/progression.test.ts`, replace the test `gives the player exactly move, mine and print to start with` (lines 39–51):

```ts
  it('gives the player everything the growing cycle needs to start with', () => {
    const state = createInitialState();
    // The readers and reset() are never locked, so they are always in the list.
    // The rest is the whole loop: clear, seed, wait for it, look, harvest.
    expect(unlockedCommands(state)).toEqual([
      'clear',
      'credits',
      'inventory',
      'mine',
      'move',
      'position',
      'print',
      'reset',
      'scan',
      'seed',
    ]);
  });
```

In the same file, in `names the reason a card is locked` (line 116) and `hides the free starting commands but keeps everything with a price` (line 153):

```ts
    expect(purchaseBlocker(state, 'scan')).toBe('already_owned');
```

```ts
    // A locked node stays on the shelf: seeing what comes next is the point.
    expect(listed).toContain('scan_at');
    expect(listed).toContain('robot_2');
```

and add to that same test, next to the existing `not.toContain` lines:

```ts
    expect(listed).not.toContain('scan');
    expect(listed).not.toContain('cultivate');
```

In `tests/concepts.test.ts`, replace `adds a concept when the unlock carrying it is bought` (lines 81–91):

```ts
  it('adds a concept when the unlock carrying it is bought', () => {
    const state = createInitialState();
    state.credits = 1000;

    expect(ids(reachedConcepts(state))).not.toContain('if_else');
    buyUnlock(state, 'scan_at'); // scanAt is what if_else now hangs on
    expect(ids(reachedConcepts(state))).toContain('if_else');
  });
```

In `tests/errorHints.test.ts`, replace the `STARTING` list (line 6):

```ts
/** What a fresh save can call. Everything else is genuinely absent from the API. */
const STARTING = [
  'clear',
  'credits',
  'inventory',
  'mine',
  'move',
  'position',
  'print',
  'reset',
  'scan',
  'seed',
];
```

and swap the two `scan` tests over to `drop`, which is now the cheapest command that is both priced and mission-gated:

```ts
  it('turns a missing name into a pointer at the shop', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'drop is not defined', line: 4 },
      STARTING,
    );

    expect(hint.message).toBe('drop() is not unlocked yet.');
    expect(hint.detail).toContain(`${getUnlock('drop')?.cost} cr`);
    expect(hint.line).toBe(4);
  });

  it('names the mission that stands in the way', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'drop is not defined', line: 1 },
      STARTING,
    );

    expect(hint.detail).toContain(getMission('m2_mine')!.title);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/progression.test.ts tests/concepts.test.ts tests/errorHints.test.ts`
Expected: FAIL. `progression` reports the starting list is missing `clear`, `scan` and `seed`; `concepts` reports `if_else` is not reached; `errorHints` is already green, because it was rewritten to match a `drop` that has not changed — run it anyway so a later failure is unambiguous.

- [ ] **Step 3: Add the unlock id**

In `src/game/types.ts`, add to `UnlockId`, after `'mine'`:

```ts
  | 'cultivate'
```

- [ ] **Step 4: Add the row and free `scan`**

In `src/game/progression.ts`, insert a new row into `UNLOCKS` directly after the `mine` row:

```ts
  {
    id: 'cultivate',
    label: 'clear() and seed()',
    description: 'Turn a tile into a field, and plant a seed crystal in it.',
    cost: 0,
    commands: ['clear', 'seed'],
  },
```

Replace the `scan` row (lines 52–60 as the file stands today):

```ts
  {
    id: 'scan',
    label: 'scan()',
    // Free, and owned from the first tick. A crop the player cannot look at is a
    // timer they have to count by hand, which is a worse game and a worse lesson.
    description: 'Read the tile below the robot: what is on it, and how long it has left.',
    cost: 0,
    commands: ['scan'],
  },
```

Note what left: the `cost`, the `requiresMission: 'm2_mine'` and the `conceptId: 'if_else'`.

Give `if_else` to `scan_at` instead — replace its `conceptId` line so the row reads:

```ts
  {
    id: 'scan_at',
    label: 'scanAt(x, y)',
    description: 'Read any tile in the factory without driving there.',
    cost: 450,
    requiresUnlocks: ['scan'],
    commands: ['scanAt'],
    conceptId: 'if_else',
  },
```

And give `objects` to `robot_2` — add the line to that row:

```ts
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
```

The `objects` panel text and example are left exactly as they are. They talk about `position()` and `scanAt()`, and `scanAt` costs 450 against `robot_2`'s 5000 — by the time this panel opens the player has owned it for a long time.

- [ ] **Step 5: Let the second robot land on ground**

Still in `src/game/progression.ts`, `addRobot()` looks for a `floor` tile and there are none left. Replace it:

```ts
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
```

Ground of any state will do. Standing on a growing crop harms nothing — robots do not trample.

- [ ] **Step 6: Hand the commands out at boot**

In `src/game/GameState.ts`:

```ts
export const STARTING_UNLOCKS: UnlockId[] = ['move', 'mine', 'print', 'scan', 'cultivate'];
```

- [ ] **Step 7: Point the `if_else` panel at ground**

In `src/game/concepts.ts`, replace the `if_else` entry (lines 45–59):

```ts
  {
    id: 'if_else',
    title: 'if and else — making a decision',
    body:
      'An if statement runs its block only when the condition is true, and the else block runs when it is not. ' +
      'Comparisons build those conditions: === asks whether two values are exactly the same. ' +
      'scan() tells the robot what state the tile below it is in, which is what turns a guess into a decision.',
    codeExample: `const tile = await scan();

if (tile.state === 'ripe') {
  await mine();
} else {
  await move('east');
}`,
  },
```

- [ ] **Step 8: Add the two editor hints**

In `src/ui/Editor.ts`, inside `COMMAND_INFO`, after the `mine` entry:

```ts
  clear: { detail: 'await clear()', info: 'Prepare the tile below the robot for planting.' },
  seed: {
    detail: "await seed('iron_ore')",
    info: 'Plant a seed crystal in the prepared tile below the robot.',
  },
```

Autocomplete is driven by `unlockedCommands`, so without these two rows the player gets the names with no description — which for the only two verbs nothing else in the game explains is the worst place to be terse.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/progression.test.ts tests/concepts.test.ts tests/errorHints.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, all green.

If `concepts.test.ts` fails on `is reachable in full — no concept is stranded without a trigger`, a concept lost its only trigger in Step 4. Check that `if_else` is on `scan_at` and `objects` is on `robot_2`, and that neither was left on `scan`.

- [ ] **Step 10: Play it**

Run: `npm run dev`. In the editor, type `cl` and confirm `clear` autocompletes with its description. Then run:

```js
while (true) {
  const tile = await scan();
  if (tile.state === 'raw') await clear();
  else if (tile.state === 'prepared') await seed('iron_ore');
  else if (tile.state === 'ripe') await mine();
  else {
    // Still growing. wait() is mission-locked on a fresh save, so a step out
    // and back is how a new player spends a tick doing nothing.
    await move('east');
    await move('west');
  }
}
```

Expected: the tile under the robot cycles raw → prepared → growing → ripe → raw, and the cargo count climbs by 3 iron ore and 1 seed crystal per cycle, until the robot fills up.

Every command here is a starting command — that is the point of the check. If any of them throws `is not unlocked yet`, Step 6 did not take.

- [ ] **Step 11: Commit**

```bash
git add src/game/types.ts src/game/progression.ts src/game/GameState.ts src/game/concepts.ts src/ui/Editor.ts tests/
git commit -m "feat(progression): hand the player the growing cycle from the first tick"
```

---

## Task 12: Remove the ore model

Every part of the old model is now dead: nothing produces an ore tile, nothing produces a floor tile, `regrowOre` runs over a grid with nothing to regrow, and `oreRegrowTicks` is a number no code reads. This task takes all of it out in one sweep — that is why it was left standing until now.

Expect a red typechecker in the middle of this task. Work top to bottom and it goes green at the end.

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/grid.ts`
- Modify: `src/game/GameState.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/engine/commands.ts`
- Modify: `src/render/meshFactory.ts`
- Modify: `src/render/WorldView.ts`
- Modify: `src/main.ts`
- Test: `tests/saveLoad.test.ts`

- [ ] **Step 1: Take the types out**

In `src/game/types.ts`, delete `FloorTile` and `OreTile` (lines 16–27 as the file stands today) and narrow the union:

```ts
export type Tile = GroundTile | MachineTile | MarketTile;
```

Delete the last field of `GameState`:

```ts
  oreRegrowTicks: number;
```

- [ ] **Step 2: Take `src/game/grid.ts` down to what it still does**

Delete `regrowOre()` (lines 54–64) and `mulberry32()` (lines 66–75) outright, and narrow the type import on line 1:

```ts
import type { Direction, Grid, Tile } from './types';
```

`OreTile` was only there for `regrowOre`. Leaving it imported is a `noUnusedLocals` error, which is the typechecker doing its job.

- [ ] **Step 3: Take the constants out of `src/game/GameState.ts`**

Delete both constants (lines 6 and 9):

```ts
export const ORE_NODE_AMOUNT = 20;
export const DEFAULT_REGROW_TICKS = 30;
```

And the field they fed in `createInitialState()`:

```ts
    oreRegrowTicks: DEFAULT_REGROW_TICKS,
```

- [ ] **Step 4: Take the field out of the save**

In `src/game/saveLoad.ts`, drop `DEFAULT_REGROW_TICKS` from the `./GameState` import, and delete this line from `MIGRATIONS[0]`:

```ts
    oreRegrowTicks: data['oreRegrowTicks'] ?? DEFAULT_REGROW_TICKS,
```

`MIGRATIONS[1]` already deletes the key, so a version 0 save no longer gains a field only to lose it one step later.

In `tests/saveLoad.test.ts`, delete this line from `fills in everything a pre-versioning save is missing`:

```ts
    delete data['oreRegrowTicks'];
```

It deletes a key that `savedState()` no longer writes.

- [ ] **Step 5: Take the ore path out of `src/engine/commands.ts`**

Narrow the two runtime imports (lines 11 and 23):

```ts
import { inBounds, isDirection, step, tileAt } from '../game/grid';
```

and delete the `ORE_NODE_AMOUNT` import line entirely:

```ts
import { ORE_NODE_AMOUNT } from '../game/GameState';
```

In `mine()`, delete everything after the harvest hand-off, so the whole function is:

```ts
export function mine(ctx: CommandContext): CommandResult {
  const tile = currentTile(ctx);
  if (tile?.kind === 'ground') return harvest(ctx, tile);
  return fail('nothing_here', 'The robot is not standing on ground it can harvest.');
}
```

In `describeTile()`, delete the `case 'ore':` branch and replace the `default:` branch — `'floor'` describes a tile kind that no longer exists, and a scan that lies is worse than a scan that admits it does not know:

```ts
    default:
      return { type: 'unknown', x, y };
```

And in `advanceWorld()`, delete the last line of the function and fix the docstring above it:

```ts
/**
 * World simulation that runs once per tick, independent of what any robot does:
 * machines finish their jobs and crops that have had their time turn ripe.
 */
```

```ts
  ripen(state);
}
```

(The `regrowOre(state.grid, state.tick, ORE_NODE_AMOUNT);` line goes; the `ripen(state);` call added in Task 5 stays and is now the last statement.)

- [ ] **Step 6: Take the ore mesh out**

In `src/render/meshFactory.ts`, delete `OreView` and `createOre()` (lines 190–222 as the file stands today). `createGround()` keeps `ORE_CHUNKS` and `geometry.oreChunk` alive — do **not** delete those.

- [ ] **Step 7: Take the ore view out of `src/render/WorldView.ts`**

Delete the `ORE_NODE_AMOUNT` import line, drop `OreView` from the type import and `createOre` from the value import, delete `ore?: OreView;` from `TileView`, delete the `case 'ore':` block from `buildTile()`, delete the ore line from `syncTiles()`, and delete the ore line from `gridSignature()` so it reads:

```ts
function gridSignature(grid: Grid): string {
  const kinds = grid.tiles
    .map((tile) => {
      if (tile.kind === 'ground') return '.';
      if (tile.kind === 'machine') return MACHINE_MARK[tile.machine];
      return tile.kind === 'market' ? 'm' : '.';
    })
    .join('');
  return `${grid.width}x${grid.height}:${kinds}`;
}
```

- [ ] **Step 8: Take the ore tooltip out**

In `src/main.ts`, delete the `case 'ore':` branch of `describeHoveredTile()` and change the fallback, since there is no floor left to name:

```ts
    default:
      return 'unknown tile';
```

- [ ] **Step 9: Prove nothing was missed**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run these four greps. Every one must come back empty:

```bash
git grep -n "OreTile\|FloorTile"
git grep -n "regrowOre\|mulberry32"
git grep -n "ORE_NODE_AMOUNT\|DEFAULT_REGROW_TICKS\|oreRegrowTicks"
git grep -n "kind === 'ore'\|kind === 'floor'"
```

A hit means the removal list above is incomplete for this working tree. Read the hit and delete it — do not add the symbol back to make the typechecker quiet.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, all green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(world): delete the ore node model"
```

---

## Task 13: README, full pass, push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Fix the one-line pitch**

In `README.md`, replace line 4:

```markdown
through a 3D factory: clear ground, plant ore, harvest it, smelt it into ingots, assemble parts,
sell them, buy upgrades.
```

- [ ] **Step 2: Fix the Status section**

The example on lines 12–13 tells a new player to write a loop that mines a tile forever, which now harvests once and then fails. There is no honest one-liner to put in its place — a loop that handles all four ground states needs a branch per state, and `wait()` is still mission-locked on a fresh save — so point at the starter script instead. Replace those two lines:

```markdown
**Phase 10a of 10 — the factory grows what it uses.** Press `E` for the editor, uncomment the
starter script and hit `Ctrl+Enter`: the robot walks to a ripe patch, harvests it, and replants it
with the seed crystal the harvest paid for. The line the robot is
```

Then add a paragraph after the one ending `...without touching what you earned.` (line 22):

```markdown
Nothing in the factory refills itself. A tile of ground goes raw → prepared → growing → ripe and
back to raw, and every step except the growing is a command your script has to issue. Harvesting a
ripe tile hands back the crop and one seed crystal, so replanting what you just took costs nothing
— but growing the *field* means crafting more crystals in the seeder, out of ore you could have
sold. Crops of the same kind next to each other yield more, which makes the shape of your field
something worth thinking about.
```

- [ ] **Step 3: Fix the project structure listing**

Replace the `game/` lines in the tree (lines 117–118):

```
  game/        the rules: types, GameState, grid, resources, recipes, cultivation,
               economy, progression, concepts, saveLoad — plain data, no DOM
```

- [ ] **Step 4: Add the design note**

Append a bullet to `## Design decisions worth knowing`:

```markdown
- **Nothing regrows for free.** The world's only autonomous act is a crop whose tick has come
  turning ripe, and something had to plant it first. There is no ore node that refills on a timer,
  which means the ceiling on production is the script, not the map — the whole point of the game.
```

- [ ] **Step 5: Mark the phase done**

In the roadmap table:

```markdown
| 10a | Cultivation core: clear, seed, grow, mine — nothing regrows free | done |
```

- [ ] **Step 6: Full pass**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: `Test Files 18 passed (18)`, 0 failed, 0 skipped.

Run: `npm run build`
Expected: builds without a TypeScript error.

Run: `npm run dev` and play one full cycle by hand — clear, seed, wait, harvest, walk to the seeder, drop 2 iron ore, craft, take a crystal, seed a second tile. Expected: no console error, and the second tile grows.

- [ ] **Step 7: Commit and push**

```bash
git add README.md
git commit -m "docs(readme): describe the cultivation loop"
git push -u origin feat/phase10-cultivation
```

---

## Done when

- `npx vitest run` reports 18 files passing, 0 failures.
- `npx tsc --noEmit` exits 0.
- `git grep -n "OreTile\|regrowOre\|ORE_NODE_AMOUNT\|oreRegrowTicks"` returns nothing.
- A save written before this phase loads into a playable factory with three machines, a market and three ripe patches.
- A script using only the starting commands can run the full cycle — clear, seed, scan, harvest — and the harvested tile can be replanted from the crystal it produced.
- `README.md` describes the loop the game actually has.

