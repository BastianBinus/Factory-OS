/**
 * The only vocabulary the main thread and the sandbox worker share.
 *
 * The rule that shapes everything here: the worker never touches game state. It
 * asks for an action and waits; the tick scheduler decides when that action
 * happens and sends back the result plus a fresh snapshot of the values the
 * player can read without spending a tick.
 */

/** What `position()` and `inventory()` answer from, between ticks. */
export interface StateSnapshot {
  /**
   * Which robot this worker drives. Every robot runs its own copy of the same
   * source, so the identity has to arrive in the data — it cannot be read off
   * the script.
   */
  robotId: string;
  /** Position in `state.robots`. What `me().index` answers with. */
  index: number;
  x: number;
  y: number;
  facing: string;
  inventory: Record<string, number>;
  tick: number;
  /** Grid bounds, for worldSize(). Lets a search know how far the floor goes. */
  width: number;
  height: number;
}

/** A named helper library the main script can pull in with `use('name')`. */
export interface ModuleSource {
  name: string;
  source: string;
}

export interface RunMessage {
  type: 'run';
  source: string;
  /** Names the player has unlocked. Everything else is absent from the API. */
  commands: string[];
  /** The player's own modules, resolved on demand when `use` is unlocked. */
  modules: ModuleSource[];
  snapshot: StateSnapshot;
}

export interface ResolveMessage {
  type: 'resolve';
  id: number;
  value: unknown;
  snapshot: StateSnapshot;
}

export interface RejectMessage {
  type: 'reject';
  id: number;
  message: string;
  snapshot: StateSnapshot;
}

export type MainToWorker = RunMessage | ResolveMessage | RejectMessage;

export interface ReadyMessage {
  type: 'ready';
  /** False when the stack format was unknown — line numbers stay off. */
  lineNumbers: boolean;
}

export interface ActionMessage {
  type: 'action';
  id: number;
  command: string;
  args: unknown[];
  line: number | null;
}

export interface LogMessage {
  type: 'log';
  text: string;
  line: number | null;
}

export interface ErrorMessage {
  type: 'error';
  name: string;
  message: string;
  line: number | null;
}

export interface DoneMessage {
  type: 'done';
}

export type WorkerToMain = ReadyMessage | ActionMessage | LogMessage | ErrorMessage | DoneMessage;
