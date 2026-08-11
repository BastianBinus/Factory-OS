# Factory OS — Gameplay Loop Redesign (Phase 10)

**Date:** 2026-08-11
**Status:** Design — awaiting approval
**Supersedes:** queued phases 9b (belts) and 9c (statistics), which are absorbed here. 9d (modules) stays queued after.

---

## 1. Why

The planfile's opening line calls Factory OS *"ein Spiel im Geist von The Farmer Was Replaced"*.
The current loop has drifted from that. Five findings, each traced to code:

| # | Problem | Evidence |
|---|---|---|
| 1 | **Credits are a lossy middleman.** `mine → walk to the market in the NW corner → sell() → credits → buy`. The return trip is a movement tax that teaches nothing. | `progression.ts` prices everything in `cost: number`; `sell` only works on the market tile |
| 2 | **7 of 17 unlocks are stat bumps.** `capacity_20/50`, `tick_300/200/120` change numbers, not the code you must write. | `applyUnlockEffect` — five of nine cases only assign a number |
| 3 | **Concepts are labels, not requirements.** `grid_12` carries `conceptId: 'arrays'`, but a 12×12 floor is beatable with a while loop and a counter. | `UNLOCKS[grid_12].conceptId` |
| 4 | **Missions gate time, not skill.** Four of six are "do what you're already doing, longer". | `MISSIONS` — goals `move:20`, `mine:15`, `credits_earned:200`, `credits_earned:2000` |
| 5 | **No optimisation pressure.** Flat prices, linear costs, ore regrows for free. Once a script works you just wait. | `RESOURCES[*].sellPrice` constant; `regrowOre()` refills on a timer |

TFWR's answer to all five: **make the mechanic impossible without the concept**, and **make the
resource itself the currency** so every harvested unit is permanent progress.

## 2. Design principles ported from TFWR

1. **Resources are the currency.** No money, no selling. You spend ore, ingots, gears directly.
2. **The player creates the resource.** Plant, wait, harvest. Nothing regrows for free.
3. **Costs scale exponentially.** A script that merely *works* stops being enough. This is the rewrite pressure, and it is the game.
4. **Every tier is a specific algorithm, and it is mandatory.** Not "here are arrays, now carry on" — the machine physically will not run until you sort.
5. **The grid grows, breaking hardcoded routes.** Forces generalisation from `move(); move();` to `for (let i = 0; i < worldSize(); i++)`.

Plus one addition that is ours, not TFWR's, because this is a factory game:

6. **Throughput is visible and always climbing.** You change code, a number moves. Bottlenecks are named.

## 3. The new core loop

```
  clear()  ──▶  seed(type)  ──▶  [matures N ticks]  ──▶  mine()
     ▲                                                      │
     └──────────────────────────────────────────────────────┤
                                                            ▼
                                              refine (smelt / press / pour)
                                                            │
                                        ┌───────────────────┴──────────────┐
                                        ▼                                  ▼
                              spend directly on unlocks          seed crystals (reinvest)
                                        │
                                        ▼
                              throughput meter climbs
```

The reinvestment arm is what makes it an economy rather than a collection: seed crystals are
crafted from ore, so a share of every harvest must go back into the ground.

## 4. World model

Replaces `FloorTile` and `OreTile` with one ground tile carrying a state machine. One tile kind
instead of four means one type guard and one switch in the renderer.

```ts
export type GroundState = 'raw' | 'prepared' | 'growing' | 'ripe';

export interface GroundTile {
  kind: 'ground';
  state: GroundState;
  /** What is seeded here. null unless growing or ripe. */
  resource: ResourceId | null;
  /** Tick at which growing becomes ripe. null unless growing. */
  ripeAt: number | null;
  /** Units mine() will yield. Fixed at seed time from neighbours. */
  yield: number;
  /** 1..10, set at seed time. Drives the calibration tier. */
  purity: number;
}
```

`MachineTile` and `MarketTile` are unchanged.

### Verbs

| Command | Precondition | Effect | Ticks |
|---|---|---|---|
| `clear()` | `state === 'raw'` | → `prepared` | 1 |
| `seed(resource)` | `state === 'prepared'`, holding ≥1 `seed_crystal` | → `growing`, consumes the crystal, sets `ripeAt`, computes `yield` and `purity` | 1 |
| `mine()` | `state === 'ripe'` | → `raw`, yields `yield` units | 1 |
| `scan()` | — | `{ state, resource, ripeIn, yield, purity }` | 0 |

`regrowOre()` is deleted. `grid.ts` loses its timer; ripening is a per-tile `ripeAt` check.

### Adjacency bonus — the "pumpkin"

`yield` is fixed when the tile is seeded:

```
yield = BASE_YIELD + ADJACENCY_BONUS × (count of the 4 neighbours
                                        that are growing or ripe
                                        with the same resource)
```

Scattered planting yields `BASE_YIELD`. A solid block yields up to `BASE_YIELD + 4×BONUS`. This
makes *where* you plant a real decision and forces whole-region iteration — nested loops over a 2D
area, not a single line.

## 5. Currency

`state.credits` is deleted. `UnlockDef.cost` becomes an `Inventory`:

```ts
{ id: 'sorting_bay', cost: { iron_ingot: 400, gear: 60 }, ... }
```

- `sell()` and `Stats.creditsEarned` / `Stats.itemsSold` are removed.
- The market tile survives as `trade()` — exchange at a fixed ratio (3 iron_ore → 1 copper_ore) so
  a player is never hard-blocked by a resource they cannot reach.
- `purchaseBlocker` gains `'missing_resources'` in place of `'too_expensive'`, and reports *which*
  resource is short.

### Cost curve

Exponential, roughly ×2.5 per tier, in ore-equivalents:

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Cost | 50 | 150 | 450 | 1,300 | 4,000 | 12,000 | 36,000 | 100,000 |

A naive one-tile-at-a-time script reaches tier 3 and stalls. That stall is the design working.

## 6. The tier ladder

Each row is impossible without its concept. This is the heart of the redesign.

| Tier | Mechanic | Why the concept is *mandatory* | Concept |
|---|---|---|---|
| 1 | **Iron field** — clear, seed, mine in a line | repetition without a loop is unwritable | `while` |
| 2 | **Mixed field** — iron and copper interleaved | must branch on `scan().resource` | `if_else` |
| 3 | **Smelting** — drop/craft/take cycles | the same 6 lines recur; extract or drown | `functions` |
| 4 | **Block planting** — adjacency yield bonus | must iterate a 2D region by coordinate | `arrays`, nested loops |
| 5 | **Calibration bay** — the Refinery only accepts the highest-`purity` batch on the floor; feeding it anything else destroys the batch | must scan every tile and find the maximum | max-finding over arrays |
| 6 | **Sorting bay** ← *the cactus* — the Press has 8 slots and fires only when loaded in ascending weight order; you get `swapSlots(i, j)` | **you must implement a sorting algorithm** | `sorting` *(new)* |
| 7 | **Foundry pour** ← *the pumpkin* — every smelter must be loaded and fired within one tick window; adjacent hot smelters merge into a higher alloy; one cold smelter fails the pour | whole-floor iteration plus a retry loop, reading an order object | `objects` |
| 8 | **Pipe routing** — impassable structures appear; route from A to B | must search the grid | `recursion` / pathfinding *(new)* |

`ConceptId` gains `sorting` and `recursion`. `for_of` keeps its current home on `grid_16`.

Speed and capacity upgrades (`tick_*`, `capacity_*`) **stay** — TFWR sells drone speed too. They
move off the spine and become a cheap side branch bought alongside the tiers.

## 7. Throughput and bottlenecks

```ts
export type StageId = 'seed' | 'mine' | 'smelt' | 'assemble' | 'press' | 'pour';

export interface RateSample {
  tick: number;
  /** Units completed per stage since the previous sample. */
  produced: Partial<Record<StageId, number>>;
}
```

- Ring buffer of 240 samples in `GameState.history` (the shape planned for 9c, now load-bearing).
- HUD shows total output/min over a rolling 60-second window, plus the delta since the last window.
- Graph panel shows per-stage rate as bars over time.
- **Bottleneck rule:** the stage with the lowest rate that has unconsumed upstream supply is
  flagged *starved*, with a one-line explanation ("smelt is starved: 2 smelters for 5 drills").

This is the feedback loop that makes rewriting satisfying — the number moves while you watch.

## 8. Save migration

`SAVE_VERSION` 1 → 2, bumped once in 10a. `MIGRATIONS[1]` performs:

| v1 | v2 |
|---|---|
| `credits: N` | `iron_ore: floor(N / 3)` — the old sell price, published in the console line |
| `unlocks` | kept, minus `sell` (command no longer exists) |
| `grid` | regenerated at the same size, every tile `ground/raw` |
| `stats.creditsEarned`, `stats.itemsSold` | dropped |
| `stats.tilesMoved`, `oreMined`, `crafted` | kept |
| `script` | untouched — the player's code is never rewritten |

A console line explains what changed and why. The live factory is converted, not wiped.

**Known consequence:** existing scripts will throw `sell is not defined` on first run after
migrating. That is correct and desirable — the error already routes through `errorHints.ts`, which
will point at the shop. The migration note names it in advance.

## 9. Phase breakdown

Each phase ends with `npm run typecheck`, `npm run test`, `npm run build` all green plus a visual
check by Bastian, then commit **and** push.

---

### Phase 10a — Cultivation core
**Goal:** The player creates the resource; nothing grows back free.
**Deliverables:** `GroundTile` + `GroundState` in `types.ts`; `clear`/`seed` in `commands.ts`,
`dispatch.ts`, `api.ts`; `regrowOre()` deleted from `grid.ts`; adjacency yield; `seed_crystal`
resource and its Seeder recipe; `SAVE_VERSION` → 2 with `MIGRATIONS[1]`; mesh + colour for the four
ground states.
**Done when:** a script can clear, seed, wait for ripeness and mine on repeat; a block-planted field
measurably out-yields a scattered one; a real v1 save migrates without data loss.
**Debug pass:** new `cultivation.test.ts` (state transitions, adjacency maths, seed consumption);
migration tested against an actual exported v1 save; full suite.

### Phase 10b — Resource currency
**Goal:** Resources are the currency; the market round-trip is gone.
**Deliverables:** `UnlockDef.cost` → `Inventory`; `credits` removed from `GameState`, HUD, shop and
`economy.ts`; `sell()` removed; `trade()` added on the market tile; `purchaseBlocker` gains
`missing_resources`; exponential cost table; missions retargeted off `credits_earned`.
**Done when:** every unlock is bought with materials, no code path references `state.credits`, and
the shop names the specific missing resource.
**Debug pass:** `economy.test.ts` and `progression.test.ts` reworked; grep for `credits` returns
only migration code.

### Phase 10c — Instrumentation *(absorbs 9c)*
**Goal:** Optimisation becomes visible.
**Deliverables:** `StageId`, `RateSample`, `history` ring buffer; per-stage counters at each
production site; HUD output meter with delta; graph panel; starved-stage detection and its
explanation line.
**Done when:** improving a script visibly raises the meter, and deliberately under-building smelters
gets `smelt` flagged as starved.
**Debug pass:** `rates.test.ts` (window maths, ring-buffer wraparound, bottleneck rule on a
hand-built state); single-sample history renders without crashing.

### Phase 10d — Calibration and sorting
**Goal:** The first two mandatory algorithms.
**Deliverables:** `purity` surfaced through `scan()`/`scanAt()`; Refinery machine rejecting
non-maximum batches; Press with 8 ordered slots and `swapSlots(i, j)`; `sorting` concept panel;
tiers 5 and 6 in the tech tree.
**Done when:** the Press cannot be fired without a working sort, and the Refinery destroys a
non-maximum batch with an explanatory console line.
**Debug pass:** tests proving both machines reject the naive approach; a reference bubble sort in
the test suite drives the Press green.

### Phase 10e — Foundry pour and routing
**Goal:** Whole-floor simultaneity and pathfinding.
**Deliverables:** pour window logic and alloy merge; failed-pour reset with a clear reason;
impassable structures on the grid; `recursion` concept panel; tiers 7 and 8.
**Done when:** a pour with one cold smelter fails and says why; a route exists that only a search
can find.
**Debug pass:** pour tested at the tick boundary in both directions; a reference BFS in tests
completes the maze.

### Phase 10f — Belts *(absorbs 9b)*
**Goal:** Material moves without robots; the optimisation surface widens.
**Deliverables:** `BeltTile { kind: 'belt'; direction; item }` per the original 9b plan, now feeding
the stage counters from 10c.
**Done when:** a belt line moves output from a smelter to the press with no robot involved, and the
throughput graph shows it.
**Debug pass:** belt-on-belt and belt-into-full-machine cases; full suite.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Cultivation makes the opening tedious** — four verbs before the first ore | Tier 1 grows fast (short `ripeAt`) and the tutorial seeds the first three tiles for the player |
| **The sort tier is a wall** — sorting is genuinely hard for a beginner | It arrives at tier 6, after arrays and nested loops; the concept panel ships a worked bubble sort |
| **`src/main.ts` is already 637 lines** and every phase adds to it | 10b removes the whole credits/HUD block; extract the cloud section (already logged as tech debt) during 10c |
| **Migration anger** — the live factory changes shape | Credits convert at a published rate, unlocks and script survive, console explains. Nothing is silently lost |
| **Scope** — six phases is a lot | Each is independently shippable and verifiable; the game is playable after every one |

## 11. Out of scope

- Leaderboard — permanently dropped
- Auto-`await` / "beginner mode" AST transform — remains rejected
- Narrative framing — still deferred
- 9d modules — stays queued, runs after 10f
