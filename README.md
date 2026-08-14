# Factory OS

A coding game that teaches JavaScript. You write real code in a real editor, and it drives a robot
through a 3D factory: clear ground, plant ore, harvest it, smelt it into ingots, assemble parts,
sell them, buy upgrades.

Every unlock deliberately introduces one new language concept — loops, conditions, functions,
arrays, objects, `async`/`await` — explained in a short panel with a runnable example. Inspired by
*The Farmer Was Replaced*.

## Status

**Phase 10a of 10 — the factory grows what it uses.** Press `E` for the editor, uncomment the
starter script and hit `Ctrl+Enter`: the robot walks to a ripe patch, harvests it, and replants it
with the seed crystal the harvest paid for. The line the robot is
executing lights up in tick rhythm, the HUD shows credits and cargo, and the console under the
editor carries `print()` output and errors with a clickable line number. Errors are translated:
a forgotten `await` and a command you have not unlocked both explain themselves instead of
throwing raw JavaScript at you.

Selling pays. `Missions` shows the chain you are working through and `Shop` turns credits into new
commands, a faster clock, a bigger robot and more factory floor — a bought command autocompletes in
the editor immediately. The game saves itself, so a reload puts you back where you were.
`Esc` closes a panel or stops the script, `Reset` puts the floor back without touching what you earned.

Nothing in the factory refills itself. A tile of ground goes raw → prepared → growing → ripe and
back to raw, and every step except the growing is a command your script has to issue. Harvesting a
ripe tile hands back the crop and one seed crystal, so replanting what you just took costs nothing
— but growing the *field* means crafting more crystals in the seeder, out of ore you could have
sold. Crops of the same kind next to each other yield more, which makes the shape of your field
something worth thinking about.

A new player is not dropped into an empty editor. A three-step tutorial waits by the bottom-left
corner — open the editor, write a line, run it — and each step waits for the thing itself to happen
rather than for a Next button. From there a `Now` line under the HUD always names the current
mission, how far along it is and which command it pays out, and every unlock that carries a new
language concept opens a short panel explaining it once. The panels stay readable afterwards under
`Missions`.

`Sign in` is optional and always was. Without it the factory lives in this browser, exactly as it
did for the first seven phases. With it, the same factory follows you to another browser — and
four more concept panels open, because signing in is the first time the game does something over a
network and that is worth explaining.

## Getting started

```bash
npm install
npx playwright install chromium   # once, for the end-to-end tests
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173/styleguide.html` for the living styleguide: every design token,
type step and component in both themes.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests (starts the dev server itself) |
| `npm run test:e2e:headed` | Same, in a visible browser |

The end-to-end tests run against Chromium only and drive one shared dev server, so they run
serially — `npx playwright install chromium` must have been run once first.

A phase is only done when typecheck, tests and build all pass, and the browser check for that
phase has been done by hand.

## Deploying

Merging to `main` does not publish anything. `vercel.json` disables automatic deployment for
`main`, and the only thing that ships is **publishing a GitHub release** — the workflow in
`.github/workflows/deploy-release.yml` then calls a Vercel deploy hook.

The reason is that `main` is where work lands, not where it is finished. Pull requests still get
their own Vercel preview URL, so a change can be opened and looked at without touching what
players see; the release is the deliberate second step.

The hook builds the tip of `main`, which it cannot be told to override. A release tagged at any
other commit would therefore publish code that was never tagged, so the workflow compares the two
first and refuses to deploy if they differ. Tag the tip of `main` and this never comes up.

One-time setup:

1. Import the repository at [vercel.com/new](https://vercel.com/new). The Vite preset is detected
   automatically: `npm run build`, output `dist/`. No environment variables are needed until
   phase 8.
2. In the project: Settings → Git → Deploy Hooks → create one named `release` on branch `main`.
3. Copy the URL into the repository under Settings → Secrets and variables → Actions → new
   repository secret named `VERCEL_DEPLOY_HOOK`. The URL is a credential; it belongs nowhere else.

## Cloud saves

Optional, and the game is built so that it stays optional: with no Supabase credentials in the
environment, `Sign in` explains that this build has no cloud and everything else behaves as before.

Copy `.env.example` to `.env` and fill in two values from your Supabase project
(Settings → API). Both are meant to be public — they ship inside the JavaScript bundle and are
useless without a signed-in session, because the database refuses every row that is not yours.

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

A `service_role` key must never appear here, in the bundle, or anywhere near the browser.

The schema is one table and lives in `supabase/migrations/`. Every policy on it is written against
`auth.uid()`, so the security boundary is the database rather than any query in the client — which
is why nothing in `src/cloud/saveApi.ts` filters by user id.

Two settings in the Supabase dashboard are not in the migration and have to be set by hand:

1. Authentication → Providers → Email is on, with **Confirm email** switched off. Leaving it on
   also works — the panel then tells the player to check their inbox — but nobody wants a
   confirmation email to play a game.
2. Authentication → URL Configuration: add the deployed origin so sessions are accepted there.

For a deployed build, the same two variables go into the Vercel project under
Settings → Environment Variables. They are read at build time, so a change needs a new deployment.

## Project structure

```
src/
  game/        the rules: types, GameState, grid, resources, recipes, cultivation,
               economy, progression, concepts, saveLoad — plain data, no DOM
  engine/      the clock and the bridge to the workers: TickScheduler, ActionQueue,
               ScriptRunner (worker lifecycle + watchdog), Fleet (one runner per
               robot, all running the same source), commands, dispatch,
               lineMapper (stack trace to author line), errorHints (raw error
               to something a beginner can act on)
  worker/      sandbox.worker.ts (hardened worker, AsyncFunction), api.ts (the
               commands the player sees), protocol.ts (shared message types)
  render/      Three.js: Scene (camera, light, theme presets), meshFactory
               (procedural geometry), WorldView (state to scene), CameraControls
  cloud/       optional Supabase layer: supabaseClient (returns null when
               unconfigured), session (sign up/in/out), saveApi (the one row),
               conflict (which save survives — pure), sync (the plumbing around it)
  style/       tokens.css is the single source of truth for the visual language
  ui/          DOM components: Hud, Controls, Editor, CodePanel, ConsolePanel,
               Drawer (shared overlay chrome), ShopPanel, MissionPanel,
               ConceptPanel, AuthPanel, ConflictDialog, Onboarding, GuideBar,
               Toast, ThemeToggle
  utils/       EventBus, safe localStorage helpers
  main.ts      app entry
  styleguide.ts  living styleguide page
supabase/migrations/  the schema, exactly as applied
tests/         Vitest suites for the headless game logic
e2e/           Playwright tests: boot, save migration, the worker-seam cultivation loop
```

`src/style/tokens.css` defines both the interface palette and the `--w-*` world colours. The
3D renderer reads the world values at runtime with `getComputedStyle`, which is why switching
themes recolours the factory without a second colour table.

## Design decisions worth knowing

- **Player scripts run in a Web Worker**, compiled as an `AsyncFunction`. Blocking commands return
  promises that the tick scheduler on the main thread resolves. An endless loop therefore stalls
  only the worker, never the interface — and the *absence* of worker messages is what the watchdog
  detects.
- **Explicit `await`.** `await move('north')` is real JavaScript. No AST rewriting, so what you
  learn here transfers unchanged to any other project.
- **No UI framework, no game engine.** Plain TypeScript and DOM, plus Three.js for the viewport,
  so the source stays readable for someone learning the language.
- **Every command costs exactly one tick.** Machines carry an input and an output buffer, so
  `craft()` only *starts* the furnace and returns immediately — the robot can walk away and pick
  the ingots up later with `take()`. Nothing in the engine has to model an action spanning ticks.
- **No external 3D assets.** Every mesh is built from `BoxGeometry`/`ExtrudeGeometry` in
  `meshFactory.ts`, so the whole factory is a few kilobytes of code with nothing to download and
  nothing to keep in sync with the palette.
- **Locked commands do not exist.** The unlocked names are passed to the compiled script as
  function parameters, so `move(...)` is a bare call and a locked name fails with the honest
  `scan is not defined` rather than a special-case check.
- **Line numbers are calibrated, never guessed.** The wrapper an engine puts around a compiled
  function shifts every line by an unknown amount, so the worker runs two probes with a known call
  line and solves for both the stack depth and the offset. If that fails, line numbers switch off
  silently and the game keeps running.
- **An error is never replaced by an invented one.** `errorHints.ts` recognises a handful of
  shapes — an unknown name, a syntax error, a blown call stack — and rewrites only those. Anything
  it does not understand reaches the console word for word, because a confident wrong explanation
  costs a learner more than a terse correct one.
- **`GameState` is plain JSON.** That is what makes the save file the state verbatim, the whole
  rule set testable without a browser, and a cloud save in phase 8 a single column.
- **Progression is a data table, not code.** `progression.ts` holds every unlock and mission as a
  row; `applyUnlockEffect` is the single place that knows what a row does to the world. Adding an
  upgrade is a new row, and the shop renders it without being told.
- **A concept is tied to a moment, not to a lesson.** The unlock or mission that first makes a
  concept useful carries its id, so the explanation arrives when the player already wants it.
  Onboarding owns the first one, which is why nothing else may open a panel until the tutorial is
  finished — two teachers talking at once teaches neither.
- **A save is never thrown away over a field that has an obvious default.** `onboardingStep` was
  added after saves existed in the wild, so it is filled in after validation rather than demanded by
  it, and it defaults to *finished*: a save that predates the tutorial belongs to someone who has
  plainly already pressed Run.
- **The save writes itself, but not on every tick.** Routine changes are written 1 s after they
  stop arriving, while an unlock or a completed mission is written immediately — progress you paid
  for should not depend on a timer. A save that cannot be read starts a new factory and says so,
  rather than refusing to boot.
- **A cloud conflict is decided by progress, not by a clock.** The plan for phase 8 said "newest
  `updated_at` wins", which quietly assumes both timestamps come from the same clock — one is
  Postgres, the other is whatever the laptop thinks the time is, so a single wrong system clock
  would win every conflict forever. Instead, a save that is ahead on *both* ticks and credits
  contains the other one and is taken silently. When neither contains the other, the game asks,
  because at that point nothing is qualified to choose. That dialog is the one modal with no
  Escape: every dismissal would mean "decide later", and the next save is what deletes the loser.
- **Every robot gets its own worker.** A single worker can hold exactly one `await`, so one script
  could never have two robots mid-action. Instead each robot runs its own copy of the same source
  and `me()` tells it which one it is — the one thing it cannot read off a file they all share.
  `Fleet` owns the runners and hands every message back to the robot it came from. An error stops
  the whole fleet: identical sources run into identical errors, and half a factory still moving
  after a crash is harder to read than an honest stop.
- **The cloud is additive, never authoritative.** Every write goes to localStorage first and to the
  network afterwards, so a failed request leaves the cloud stale rather than the factory gone. The
  timer-driven upload fails silently on purpose; only the deliberate moments report.
- **Nothing regrows for free.** The world's only autonomous act is a crop whose tick has come
  turning ripe, and something had to plant it first. There is no ore node that refills on a timer,
  which means the ceiling on production is the script, not the map — the whole point of the game.

## Tech

Vite · TypeScript (strict) · Three.js · CodeMirror 6 · Vitest · Supabase (from phase 8) · Vercel

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 0 | Foundation, design tokens, theme system, styleguide | done |
| 1 | Headless game core: grid, recipes, economy, commands | done |
| 2 | 3D world: scene, procedural meshes, camera | done |
| 3 | Editor, worker sandbox, tick engine | done |
| 4 | HUD, console, error experience, active-line highlight | done |
| 5 | Economy, shop, tech tree, missions | done |
| 6 | Guided learning panels, onboarding | done |
| 7 | Polish and deploy to Vercel | done |
| 8 | Supabase: auth, cloud saves, conflict resolution | done |
| 9a | A worker per robot: the second robot actually runs the script | done |
| 10a | Cultivation core: clear, seed, grow, mine — nothing regrows free | done |
| 10b | Resources become the currency; credits and the mission chain removed | done |
| 10c | Throughput meter and bottleneck graphs (absorbs 9c) | done |
| 10d | Calibration and sorting bay — the first mandatory algorithms | done |
| 10e | Foundry pour and pipe routing | done |
| 10f | Conveyor belts (absorbs 9b) | done |
| 9d | Script library with real modules | done |

Phase 10 reworks the gameplay loop along the lines of *The Farmer Was Replaced*: the player plants
and harvests rather than collecting from nodes that refill themselves, resources are spent directly
instead of sold for credits, and each tier is impossible without a specific algorithm. Full design:
[`docs/specs/2026-08-11-gameplay-loop-redesign.md`](docs/specs/2026-08-11-gameplay-loop-redesign.md).
