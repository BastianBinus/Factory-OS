import type { CommandResult } from '../game/types';
import type { CommandContext } from './commands';
import {
  clear,
  craft,
  drop,
  load,
  mine,
  move,
  pour,
  press,
  refine,
  scan,
  scanAt,
  seed,
  swapSlots,
  take,
  trade,
  wait,
} from './commands';

/**
 * The one place that maps a command name coming out of a script onto the pure
 * function that performs it. Keeping it here means `commands.ts` stays a set of
 * functions with no notion of being called by name, and the tick loop stays free
 * of a growing switch.
 */

export type CommandRunner = (ctx: CommandContext, args: unknown[]) => CommandResult;

const RUNNERS: Record<string, CommandRunner> = {
  move: (ctx, args) => move(ctx, args[0]),
  clear: (ctx) => clear(ctx),
  seed: (ctx, args) => seed(ctx, args[0]),
  mine: (ctx) => mine(ctx),
  drop: (ctx) => drop(ctx),
  craft: (ctx) => craft(ctx),
  take: (ctx) => take(ctx),
  refine: (ctx) => refine(ctx),
  load: (ctx) => load(ctx),
  swapSlots: (ctx, args) => swapSlots(ctx, args[0], args[1]),
  press: (ctx) => press(ctx),
  pour: (ctx) => pour(ctx),
  trade: (ctx, args) => trade(ctx, args[0], args[1]),
  wait: () => wait(),
  scan: (ctx) => scan(ctx),
  scanAt: (ctx, args) => scanAt(ctx, args[0], args[1]),
};

export function runCommand(command: string, ctx: CommandContext, args: unknown[]): CommandResult {
  const runner = RUNNERS[command];
  if (!runner) {
    return { ok: false, code: 'bad_argument', error: `${command}() is not a command this factory knows.` };
  }
  return runner(ctx, args);
}

export function isCommand(name: string): boolean {
  return name in RUNNERS;
}
