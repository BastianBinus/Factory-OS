# Factory OS

A coding game that teaches JavaScript. You write real code in a real editor, and it drives a robot
through a 3D factory: mine ore, smelt it into ingots, assemble parts, sell them, buy upgrades.

Every unlock deliberately introduces one new language concept — loops, conditions, functions,
arrays, objects, `async`/`await` — explained in a short panel with a runnable example. Inspired by
*The Farmer Was Replaced*.

## Status

**Phase 6 of 8 — it teaches now.** Press `E` for the editor, write
`while (true) { await move('north'); await mine(); }` and hit `Ctrl+Enter`. The line the robot is
executing lights up in tick rhythm, the HUD shows credits and cargo, and the console under the
editor carries `print()` output and errors with a clickable line number. Errors are translated:
a forgotten `await` and a command you have not unlocked both explain themselves instead of
throwing raw JavaScript at you.

Selling pays. `Missions` shows the chain you are working through and `Shop` turns credits into new
commands, a faster clock, a bigger robot and more factory floor — a bought command autocompletes in
the editor immediately. The game saves itself, so a reload puts you back where you were.
`Esc` closes a panel or stops the script, `Reset` puts the floor back without touching what you earned.

A new player is not dropped into an empty editor. A three-step tutorial waits by the bottom-left
corner — open the editor, write a line, run it — and each step waits for the thing itself to happen
rather than for a Next button. From there a `Now` line under the HUD always names the current
mission, how far along it is and which command it pays out, and every unlock that carries a new
language concept opens a short panel explaining it once. The panels stay readable afterwards under
`Missions`.

## Getting started

```bash
npm install
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

A phase is only done when typecheck, tests and build all pass, and the browser check for that
phase has been done by hand.

## Project structure

```
src/
  game/        the rules: types, GameState, grid, resources, recipes,
               economy, progression, concepts, saveLoad — plain data, no DOM
  engine/      the clock and the bridge to the worker: TickScheduler, ActionQueue,
               ScriptRunner (worker lifecycle + watchdog), commands, dispatch,
               lineMapper (stack trace to author line), errorHints (raw error
               to something a beginner can act on)
  worker/      sandbox.worker.ts (hardened worker, AsyncFunction), api.ts (the
               commands the player sees), protocol.ts (shared message types)
  render/      Three.js: Scene (camera, light, theme presets), meshFactory
               (procedural geometry), WorldView (state to scene), CameraControls
  style/       tokens.css is the single source of truth for the visual language
  ui/          DOM components: Hud, Controls, Editor, CodePanel, ConsolePanel,
               Drawer (shared overlay chrome), ShopPanel, MissionPanel,
               ConceptPanel, Onboarding, GuideBar, Toast, ThemeToggle
  utils/       EventBus, safe localStorage helpers
  main.ts      app entry
  styleguide.ts  living styleguide page
tests/         Vitest suites for the headless game logic
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
| 7 | Polish and deploy to Vercel | next |
| 8 | Supabase: auth, cloud saves, edge functions |  |
