import type {
  ActionMessage,
  MainToWorker,
  ModuleSource,
  StateSnapshot,
  WorkerToMain,
} from '../worker/protocol';

/**
 * Owns the worker the player's script runs in.
 *
 * Every run gets a fresh worker and every stop terminates it. That is blunt on
 * purpose: a terminated worker cannot leave a half-finished script holding
 * promises that resolve into a world which has moved on since.
 */

export type StopReason = 'user' | 'timeout' | 'error' | 'finished';

/**
 * How long the worker may stay silent while it is free to run before we call it
 * an endless loop. It only counts while the script is *not* waiting on us, so a
 * paused game or a slow tick rate can never trip it.
 */
const WATCHDOG_MS = 2000;

const WATCHDOG_MESSAGE =
  'Your script ran for 2 seconds without performing an action. ' +
  "Does your loop contain an 'await'?";

export interface ScriptRunnerHandlers {
  /** Fires once per run. False means the stack format was unknown. */
  onReady?: (lineNumbers: boolean) => void;
  onAction: (action: ActionMessage) => void;
  onLog?: (text: string, line: number | null) => void;
  onError?: (error: { name: string; message: string; line: number | null }) => void;
  onStopped?: (reason: StopReason, message?: string) => void;
}

export class ScriptRunner {
  private readonly handlers: ScriptRunnerHandlers;
  private worker: Worker | null = null;
  private watchdog: number | null = null;

  constructor(handlers: ScriptRunnerHandlers) {
    this.handlers = handlers;
  }

  get running(): boolean {
    return this.worker !== null;
  }

  start(source: string, modules: ModuleSource[], commands: string[], snapshot: StateSnapshot): void {
    this.stop('user');

    const worker = new Worker(new URL('../worker/sandbox.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;

    worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
      this.onMessage(event.data);
    });
    worker.addEventListener('error', (event) => {
      // A syntax error in the player's source surfaces here, before any of our
      // own messages have had a chance to run.
      this.handlers.onError?.({
        name: 'SyntaxError',
        message: event.message || 'The script could not be compiled.',
        line: null,
      });
      this.stop('error');
    });

    this.send({ type: 'run', source, modules, commands, snapshot });
    this.armWatchdog();
  }

  /** The tick loop ran the action; hand the result back to the script. */
  resolve(id: number, value: unknown, snapshot: StateSnapshot): void {
    this.send({ type: 'resolve', id, value, snapshot });
    this.armWatchdog();
  }

  /** The action could not be performed; the script sees a thrown error. */
  reject(id: number, message: string, snapshot: StateSnapshot): void {
    this.send({ type: 'reject', id, message, snapshot });
    this.armWatchdog();
  }

  stop(reason: StopReason = 'user'): void {
    this.clearWatchdog();
    if (!this.worker) return;

    this.worker.terminate();
    this.worker = null;
    this.handlers.onStopped?.(reason);
  }

  private send(message: MainToWorker): void {
    this.worker?.postMessage(message);
  }

  private onMessage(message: WorkerToMain): void {
    // Any sign of life means the script is progressing, not spinning.
    this.clearWatchdog();

    switch (message.type) {
      case 'ready':
        this.handlers.onReady?.(message.lineNumbers);
        this.armWatchdog();
        return;

      case 'action':
        // From here the script waits on us, so the watchdog stays off.
        this.handlers.onAction(message);
        return;

      case 'log':
        this.handlers.onLog?.(message.text, message.line);
        this.armWatchdog();
        return;

      case 'error':
        this.handlers.onError?.(message);
        this.stop('error');
        return;

      case 'done':
        this.stop('finished');
        return;
    }
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    if (!this.worker) return;
    this.watchdog = window.setTimeout(() => {
      this.handlers.onError?.({ name: 'TimeoutError', message: WATCHDOG_MESSAGE, line: null });
      this.stop('timeout');
    }, WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdog === null) return;
    clearTimeout(this.watchdog);
    this.watchdog = null;
  }
}
