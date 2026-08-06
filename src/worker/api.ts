import type { StateSnapshot } from './protocol';

/**
 * The surface the player writes against. Two kinds of function live here:
 *
 * - blocking ones return a promise the main thread resolves on the next tick,
 *   which is why they need `await`;
 * - readers answer straight from the last snapshot and cost nothing.
 *
 * Locked commands are not built at all. Calling one is a plain
 * `move is not defined`, which the error hints turn into a pointer at the shop.
 */

export interface ApiHost {
  /** Hand an action to the main thread and wait for the tick that runs it. */
  request(command: string, args: unknown[], stack: string | undefined): Promise<unknown>;
  log(text: string, stack: string | undefined): void;
  /** Author line for a stack, or null while line mapping is uncalibrated. */
  lineOf(stack: string | undefined): number | null;
  snapshot(): StateSnapshot;
}

/**
 * An error the API raised on the player's behalf. It carries the line of the
 * call that caused it, because its own stack points into engine code the player
 * never wrote.
 */
export class ApiError extends Error {
  readonly line: number | null;

  constructor(message: string, line: number | null) {
    super(message);
    this.name = 'ApiError';
    this.line = line;
  }
}

/** Readers and `print` never reach the tick loop, everything else does. */
const INSTANT = new Set(['print', 'position', 'inventory', 'credits']);

const MAX_WAIT_TICKS = 1000;

export function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return `${value}n`;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object' || Array.isArray(value)) {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function createApi(commands: readonly string[], host: ApiHost): Record<string, unknown> {
  const api: Record<string, unknown> = {};

  /**
   * A command that has been asked for but not yet run. Its presence when the
   * next command arrives is the giveaway for a forgotten `await` — the script
   * could not have got there otherwise.
   */
  let pending: { command: string; stack: string | undefined } | null = null;

  const guard = (command: string, stack: string | undefined): void => {
    if (!pending) return;
    const line = host.lineOf(pending.stack);
    const where = line === null ? '' : ` on line ${line}`;
    throw new ApiError(
      `${command}() was called while ${pending.command}() was still running. ` +
        `Did you forget 'await'${where}?`,
      host.lineOf(stack),
    );
  };

  const request = async (command: string, args: unknown[], stack: string | undefined): Promise<unknown> => {
    guard(command, stack);
    pending = { command, stack };
    try {
      return await host.request(command, args, stack);
    } finally {
      pending = null;
    }
  };

  for (const command of commands) {
    if (INSTANT.has(command)) continue;

    if (command === 'wait') {
      // One tick is the only unit the engine has, so n ticks are n waits. The
      // player still writes wait(5) and gets five ticks of nothing.
      api['wait'] = async (ticks: unknown = 1): Promise<null> => {
        const stack = new Error().stack;
        if (typeof ticks !== 'number' || !Number.isFinite(ticks)) {
          throw new ApiError(
            `wait() needs a number of ticks — got ${formatValue(ticks)}.`,
            host.lineOf(stack),
          );
        }
        const count = Math.min(MAX_WAIT_TICKS, Math.max(1, Math.floor(ticks)));
        for (let i = 0; i < count; i += 1) await request('wait', [], stack);
        return null;
      };
      continue;
    }

    api[command] = async (...args: unknown[]): Promise<unknown> =>
      request(command, args, new Error().stack);
  }

  if (commands.includes('print')) {
    api['print'] = (...args: unknown[]): void => {
      host.log(args.map(formatValue).join(' '), new Error().stack);
    };
  }

  if (commands.includes('position')) {
    api['position'] = (): { x: number; y: number } => {
      const snapshot = host.snapshot();
      return { x: snapshot.x, y: snapshot.y };
    };
  }

  if (commands.includes('inventory')) {
    // A copy: the player is free to mutate what they get back.
    api['inventory'] = (): Record<string, number> => ({ ...host.snapshot().inventory });
  }

  if (commands.includes('credits')) {
    api['credits'] = (): number => host.snapshot().credits;
  }

  return api;
}
