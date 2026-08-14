import type { ScriptRunnerHandlers, StopReason } from './ScriptRunner';
import type { ActionMessage, ModuleSource, StateSnapshot } from '../worker/protocol';

/**
 * One script runner per robot.
 *
 * Every robot runs its own copy of the same source in its own worker, which is
 * the only arrangement in which two robots can genuinely work at the same time:
 * a single worker can hold exactly one `await`, so one script could never have
 * two robots mid-action. The cost is that "the script is running" stops being a
 * boolean anyone can read off a worker and becomes something this class has to
 * keep track of.
 *
 * The runner factory is injected rather than constructed here for the same
 * reason `pull`/`push` are injected into `cloud/sync.ts`: the interesting part
 * is the coordination — who gets which answer, when the fleet is finally at
 * rest — and none of it should need a `Worker` to be tested.
 */

/** The part of `ScriptRunner` a fleet actually uses. */
export interface FleetRunner {
  readonly running: boolean;
  start(source: string, modules: ModuleSource[], commands: string[], snapshot: StateSnapshot): void;
  resolve(id: number, value: unknown, snapshot: StateSnapshot): void;
  reject(id: number, message: string, snapshot: StateSnapshot): void;
  stop(reason?: StopReason): void;
}

export interface FleetHandlers {
  onReady?: (robotId: string, lineNumbers: boolean) => void;
  onAction: (robotId: string, action: ActionMessage) => void;
  onLog?: (robotId: string, text: string, line: number | null) => void;
  onError?: (robotId: string, error: { name: string; message: string; line: number | null }) => void;
  /** Fires once, when the last robot has come to a stop. */
  onIdle?: (reason: StopReason) => void;
}

export interface FleetOptions {
  createRunner: (robotId: string, handlers: ScriptRunnerHandlers) => FleetRunner;
  handlers: FleetHandlers;
}

export interface FleetMember {
  robotId: string;
  snapshot: StateSnapshot;
}

/**
 * Which reason survives when several robots stop for different ones. A crash is
 * the thing the player needs to hear about, so it outranks a neighbour that
 * merely ran out of script.
 *
 * `finished` sits at the bottom because it is the one outcome nobody caused: a
 * robot reaching the end of the file while the player presses Stop is a run the
 * player stopped, and saying "Script finished." there would take the credit for
 * something they interrupted.
 */
const SEVERITY: Record<StopReason, number> = {
  finished: 0,
  user: 1,
  timeout: 2,
  error: 3,
};

export class Fleet {
  private readonly createRunner: FleetOptions['createRunner'];
  private readonly handlers: FleetHandlers;
  private readonly runners = new Map<string, FleetRunner>();
  private readonly live = new Set<string>();

  /** Set while `stop()` is tearing the fleet down, so idle is announced once. */
  private settling = false;

  /** The floor: every other reason outranks it, so the first one always lands. */
  private worstReason: StopReason = 'finished';

  constructor(options: FleetOptions) {
    this.createRunner = options.createRunner;
    this.handlers = options.handlers;
  }

  /** True while at least one robot still has a script in flight. */
  get running(): boolean {
    return this.live.size > 0;
  }

  get size(): number {
    return this.runners.size;
  }

  robotIds(): string[] {
    return [...this.runners.keys()];
  }

  start(members: readonly FleetMember[], source: string, modules: ModuleSource[], commands: string[]): void {
    this.stop('user');

    this.worstReason = 'finished';
    this.settling = false;

    // Built in two passes on purpose: a robot whose script throws during start
    // must not find a half-populated fleet when its error arrives.
    for (const member of members) {
      this.runners.set(member.robotId, this.createRunner(member.robotId, this.handlersFor(member.robotId)));
      this.live.add(member.robotId);
    }

    for (const member of members) {
      this.runners.get(member.robotId)?.start(source, modules, commands, member.snapshot);
    }
  }

  stop(reason: StopReason = 'user'): void {
    if (this.runners.size === 0) return;

    this.settling = true;
    this.note(reason);

    for (const runner of this.runners.values()) runner.stop(reason);

    this.runners.clear();
    this.live.clear();
    this.settling = false;
    this.handlers.onIdle?.(this.worstReason);
  }

  resolve(robotId: string, id: number, value: unknown, snapshot: StateSnapshot): void {
    this.runners.get(robotId)?.resolve(id, value, snapshot);
  }

  reject(robotId: string, id: number, message: string, snapshot: StateSnapshot): void {
    this.runners.get(robotId)?.reject(id, message, snapshot);
  }

  private handlersFor(robotId: string): ScriptRunnerHandlers {
    return {
      onReady: (lineNumbers) => this.handlers.onReady?.(robotId, lineNumbers),

      onAction: (action) => this.handlers.onAction(robotId, action),

      onLog: (text, line) => this.handlers.onLog?.(robotId, text, line),

      onError: (error) => {
        this.handlers.onError?.(robotId, error);
        // One robot crashing while its twin keeps mining reads as the game
        // ignoring the error. They run identical source anyway, so the second
        // failure would only be the same message twice.
        this.stopOthers(robotId);
      },

      onStopped: (reason) => {
        this.note(reason);
        this.live.delete(robotId);
        if (this.settling || this.live.size > 0) return;

        this.runners.clear();
        this.handlers.onIdle?.(this.worstReason);
      },
    };
  }

  /** Ends every robot but the one whose failure started this. */
  private stopOthers(robotId: string): void {
    for (const [id, runner] of this.runners) {
      if (id === robotId) continue;
      runner.stop('error');
    }
  }

  private note(reason: StopReason): void {
    if (SEVERITY[reason] > SEVERITY[this.worstReason]) this.worstReason = reason;
  }
}
