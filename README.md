# Factory OS

A coding game that teaches JavaScript. You write real code in a real editor, and it drives a robot
through a 3D factory: mine ore, smelt it into ingots, assemble parts, sell them, buy upgrades.

Every unlock deliberately introduces one new language concept — loops, conditions, functions,
arrays, objects, `async`/`await` — explained in a short panel with a runnable example. Inspired by
*The Farmer Was Replaced*.

## Status

**Phase 2 of 8 — the factory is on screen.** The headless rules from phase 1 now render as a
3D floor with ore, a smelter, an assembler, a market and a robot that glides between tiles.
A temporary debug bar at the bottom drives the robot by hand; phase 3 hands that job to your
script.

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
               economy, progression, saveLoad — plain data, no DOM
  engine/      commands.ts today; tick scheduler and worker bridge in phase 3
  render/      Three.js: Scene (camera, light, theme presets), meshFactory
               (procedural geometry), WorldView (state to scene), CameraControls
  style/       tokens.css is the single source of truth for the visual language
  ui/          DOM components (theme toggle today, HUD/editor/panels later)
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
- **`GameState` is plain JSON.** That is what makes the save file the state verbatim, the whole
  rule set testable without a browser, and a cloud save in phase 8 a single column.

## Tech

Vite · TypeScript (strict) · Three.js · CodeMirror 6 · Vitest · Supabase (from phase 8) · Vercel

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 0 | Foundation, design tokens, theme system, styleguide | done |
| 1 | Headless game core: grid, recipes, economy, commands | done |
| 2 | 3D world: scene, procedural meshes, camera | done |
| 3 | Editor, worker sandbox, tick engine | next |
| 4 | HUD, console, error experience, active-line highlight |  |
| 5 | Economy, shop, tech tree, missions |  |
| 6 | Guided learning panels, onboarding |  |
| 7 | Polish and deploy to Vercel |  |
| 8 | Supabase: auth, cloud saves, edge functions |  |
