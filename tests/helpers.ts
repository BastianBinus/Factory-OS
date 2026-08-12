import type { CommandResult, GameState, GroundTile, MachineTile, Robot } from '../src/game/types';
import { createInitialState, createRobot, gridFromLayout } from '../src/game/GameState';
import { tileAt } from '../src/game/grid';
import { advanceWorld, move } from '../src/engine/commands';
import type { CommandContext } from '../src/engine/commands';

/**
 * Test-only scaffolding. Mirrors what TickScheduler will do in Phase 3: a tick
 * advances the clock, then runs at most one command, then lets the world settle.
 */

/** Builds a state around a hand-drawn layout. Same characters as GameState.ts. */
export function stateFromLayout(layout: string[], x = 0, y = 0): GameState {
  const state = createInitialState();
  state.grid = gridFromLayout(layout);
  state.robots = [createRobot('r1', x, y)];
  return state;
}

export function ctxOf(state: GameState): CommandContext {
  const robot = state.robots[0];
  if (!robot) throw new Error('test state has no robot');
  return { state, robot };
}

export function robotOf(state: GameState): Robot {
  return ctxOf(state).robot;
}

/** Runs one command inside one tick and returns its result. */
export function runTick(
  state: GameState,
  action: (ctx: CommandContext) => CommandResult,
): CommandResult {
  state.tick += 1;
  const result = action(ctxOf(state));
  advanceWorld(state);
  return result;
}

/** Lets `count` ticks pass without the robot doing anything. */
export function idle(state: GameState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    state.tick += 1;
    advanceWorld(state);
  }
}

/** Drives the robot to a tile, x axis first. Returns how many ticks it took. */
export function walkTo(state: GameState, x: number, y: number): number {
  let ticks = 0;
  while (robotOf(state).x !== x) {
    const direction = robotOf(state).x < x ? 'east' : 'west';
    expectOk(runTick(state, (ctx) => move(ctx, direction)));
    ticks += 1;
  }
  while (robotOf(state).y !== y) {
    const direction = robotOf(state).y < y ? 'south' : 'north';
    expectOk(runTick(state, (ctx) => move(ctx, direction)));
    ticks += 1;
  }
  return ticks;
}

export function groundAt(state: GameState, x: number, y: number): GroundTile {
  const tile = tileAt(state.grid, x, y);
  if (tile?.kind !== 'ground') throw new Error(`no ground at ${x},${y}`);
  return tile;
}

export function machineAt(state: GameState, x: number, y: number): MachineTile {
  const tile = tileAt(state.grid, x, y);
  if (tile?.kind !== 'machine') throw new Error(`no machine at ${x},${y}`);
  return tile;
}

export function expectOk(result: CommandResult): Extract<CommandResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.error}`);
  return result;
}

export function expectFail(result: CommandResult): Extract<CommandResult, { ok: false }> {
  if (result.ok) throw new Error(`expected failure, got success: ${JSON.stringify(result.value)}`);
  return result;
}
