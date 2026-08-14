/// <reference lib="webworker" />
import { ApiError, createApi } from './api';
import type { ApiHost } from './api';
import { createModuleResolver } from '../game/modules';
import type { MainToWorker, RunMessage, StateSnapshot, WorkerToMain } from './protocol';
import { LineOffset, frameLine } from '../engine/lineMapper';

/**
 * Where the player's script actually runs.
 *
 * The worker owns no game state. It compiles the source, hands every action to
 * the main thread and waits. An endless loop in here therefore stalls nothing
 * but this thread — and the silence that follows is exactly what the watchdog on
 * the other side is listening for.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = scope.postMessage.bind(scope);

function send(message: WorkerToMain): void {
  post(message);
}

// Hardening -------------------------------------------------------------------

/*
 * Not a security boundary — the code being run is the player's own. It keeps the
 * API surface small and teachable, and stops a copy-pasted snippet from quietly
 * reaching the network. Runs after the imports above so anything the module
 * system needed is already wired up.
 */
const BLOCKED = [
  'fetch',
  'XMLHttpRequest',
  'importScripts',
  'WebSocket',
  'EventSource',
  'indexedDB',
  'caches',
  'Worker',
  'postMessage',
];

for (const name of BLOCKED) {
  const blocked = (): never => {
    throw new Error(`${name}() is not available inside a factory script.`);
  };
  try {
    Object.defineProperty(scope, name, { configurable: true, writable: true, value: blocked });
  } catch {
    // A non-configurable global is rare and harmless; skip it.
  }
}

// Compiling -------------------------------------------------------------------

type CompiledScript = (...args: unknown[]) => Promise<unknown>;
type AsyncFunctionConstructor = new (...args: string[]) => CompiledScript;

const AsyncFunction = Object.getPrototypeOf(async function noop(): Promise<void> {})
  .constructor as AsyncFunctionConstructor;

/**
 * The unlocked commands become parameters, so the player writes `move(...)`
 * rather than `api.move(...)` and a locked name is an honest
 * "move is not defined" instead of a silent no-op.
 */
function compile(names: string[], source: string): CompiledScript {
  return new AsyncFunction(...names, source);
}

// Line calibration ------------------------------------------------------------

/** Two probes, so a frame from our own code cannot masquerade as the player's. */
const PROBE_ONE = { line: 2, source: '// calibration probe\nawait $CMD();\n' };
const PROBE_TWO = { line: 7, source: `${'//\n'.repeat(6)}await $CMD();\n` };

const lineOffset = new LineOffset();
/** Stack depth at which a command call site appears. Found, never assumed. */
let callDepth = 1;

function lineOfCall(stack: string | undefined): number | null {
  return lineOffset.toAuthorLine(frameLine(stack, callDepth));
}

async function probeStack(names: string[], command: string, probe: { source: string }): Promise<string | undefined> {
  let captured: string | undefined;

  const host: ApiHost = {
    request: (_command, _args, stack) => {
      captured = stack;
      return Promise.resolve(null);
    },
    log: (_text, stack) => {
      captured = stack;
    },
    lineOf: () => null,
    snapshot: () => EMPTY_SNAPSHOT,
  };

  const api = createApi(names, host);
  const keys = Object.keys(api);
  const script = compile(keys, probe.source.replace('$CMD', command));
  await script(...keys.map((key) => api[key]));

  return captured;
}

/**
 * Finds the depth at which the player's own frame sits, then the offset the
 * wrapper adds. Probes differ by five lines: a frame inside engine code reports
 * the same line for both and is rejected, only the player's frame moves along.
 */
async function calibrate(names: string[], command: string): Promise<void> {
  callDepth = 1;
  lineOffset.calibrate(null, 0);

  let one: string | undefined;
  let two: string | undefined;
  try {
    one = await probeStack(names, command, PROBE_ONE);
    two = await probeStack(names, command, PROBE_TWO);
  } catch {
    return;
  }

  for (let depth = 0; depth < 8; depth += 1) {
    const first = frameLine(one, depth);
    const second = frameLine(two, depth);
    if (first === null || second === null) continue;
    if (first - PROBE_ONE.line !== second - PROBE_TWO.line) continue;
    if (lineOffset.calibrate(first, PROBE_ONE.line)) {
      callDepth = depth;
      return;
    }
  }
}

/** A blocking command is needed to probe with; `move` is there from the start. */
function probeCommand(names: string[]): string | null {
  const usable = names.filter(
    (name) => !['print', 'position', 'inventory', 'wait', 'use'].includes(name),
  );
  return usable.includes('move') ? 'move' : (usable[0] ?? null);
}

/**
 * The `use('name')` a module-enabled script writes against. Not an action —
 * it runs the player's own module synchronously and returns its exports — so it
 * is built here from the run message rather than living in the tick API.
 */
function buildUse(message: RunMessage): (name: unknown) => Record<string, unknown> {
  const resolve = createModuleResolver(message.modules);
  return (name: unknown): Record<string, unknown> => {
    if (typeof name !== 'string') {
      throw new Error(`use() needs a module name — got ${String(name)}.`);
    }
    return resolve(name);
  };
}

// Running ---------------------------------------------------------------------

const EMPTY_SNAPSHOT: StateSnapshot = {
  robotId: '',
  index: 0,
  x: 0,
  y: 0,
  facing: 'south',
  inventory: {},
  tick: 0,
  width: 0,
  height: 0,
};

interface PendingAction {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  line: number | null;
}

let snapshot: StateSnapshot = EMPTY_SNAPSHOT;
let running = false;
let nextActionId = 1;
const pendingActions = new Map<number, PendingAction>();

const host: ApiHost = {
  request(command, args, stack) {
    const id = nextActionId;
    nextActionId += 1;
    const line = lineOfCall(stack);

    return new Promise<unknown>((resolve, reject) => {
      pendingActions.set(id, { resolve, reject, line });
      send({ type: 'action', id, command, args, line });
    });
  },

  log(text, stack) {
    send({ type: 'log', text, line: lineOfCall(stack) });
  },

  lineOf(stack) {
    return lineOfCall(stack);
  },

  snapshot() {
    return snapshot;
  },
};

function errorLine(error: unknown): number | null {
  if (error instanceof ApiError) return error.line;
  // A genuine runtime error was thrown where the player wrote it: frame zero.
  if (error instanceof Error) return lineOffset.toAuthorLine(frameLine(error.stack, 0));
  return null;
}

function describe(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

async function run(message: RunMessage): Promise<void> {
  if (running) return;
  running = true;
  snapshot = message.snapshot;
  pendingActions.clear();

  const probe = probeCommand(message.commands);
  if (probe) await calibrate(message.commands, probe);

  const api = createApi(message.commands, host);
  const keys = Object.keys(api);
  const values: unknown[] = keys.map((key) => api[key]);

  // `use` rides in as one more parameter, so a locked module system is an honest
  // "use is not defined" rather than a silent no-op.
  if (message.commands.includes('use')) {
    keys.push('use');
    values.push(buildUse(message));
  }

  send({ type: 'ready', lineNumbers: lineOffset.calibrated });

  try {
    const script = compile(keys, message.source);
    await script(...values);
    send({ type: 'done' });
  } catch (error) {
    const { name, message: text } = describe(error);
    send({ type: 'error', name, message: text, line: errorLine(error) });
  } finally {
    running = false;
    pendingActions.clear();
  }
}

scope.addEventListener('message', (event: MessageEvent<MainToWorker>) => {
  const message = event.data;

  switch (message.type) {
    case 'run':
      void run(message);
      return;

    case 'resolve': {
      snapshot = message.snapshot;
      const pending = pendingActions.get(message.id);
      pendingActions.delete(message.id);
      pending?.resolve(message.value);
      return;
    }

    case 'reject': {
      snapshot = message.snapshot;
      const pending = pendingActions.get(message.id);
      pendingActions.delete(message.id);
      pending?.reject(new ApiError(message.message, pending.line));
      return;
    }
  }
});
