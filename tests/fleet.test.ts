import { beforeEach, describe, expect, it } from 'vitest';
import { Fleet } from '../src/engine/Fleet';
import type { FleetRunner } from '../src/engine/Fleet';
import type { ScriptRunnerHandlers, StopReason } from '../src/engine/ScriptRunner';
import type { ModuleSource, StateSnapshot } from '../src/worker/protocol';

/**
 * A runner that never opens a worker. It answers the same shape `ScriptRunner`
 * does — including its rule that stopping something already stopped is silent —
 * so the fleet cannot tell the difference, and the coordination can be tested
 * without a browser.
 */
class FakeRunner implements FleetRunner {
  running = false;

  readonly starts: { source: string; commands: string[]; snapshot: StateSnapshot }[] = [];
  readonly resolved: { id: number; value: unknown }[] = [];
  readonly rejected: { id: number; message: string }[] = [];
  readonly stops: StopReason[] = [];

  constructor(
    readonly robotId: string,
    readonly handlers: ScriptRunnerHandlers,
  ) {}

  start(source: string, _modules: ModuleSource[], commands: string[], snapshot: StateSnapshot): void {
    this.running = true;
    this.starts.push({ source, commands, snapshot });
  }

  resolve(id: number, value: unknown): void {
    this.resolved.push({ id, value });
  }

  reject(id: number, message: string): void {
    this.rejected.push({ id, message });
  }

  stop(reason: StopReason = 'user'): void {
    this.stops.push(reason);
    if (!this.running) return;
    this.running = false;
    this.handlers.onStopped?.(reason);
  }

  // What the worker would send ------------------------------------------------

  finish(): void {
    this.stop('finished');
  }

  crash(message = 'boom'): void {
    this.handlers.onError?.({ name: 'Error', message, line: 3 });
    this.stop('error');
  }
}

function snapshotFor(robotId: string, index: number): StateSnapshot {
  return {
    robotId,
    index,
    x: index,
    y: 0,
    facing: 'south',
    inventory: {},
    tick: 0,
    width: 8,
    height: 8,
  };
}

let created: FakeRunner[] = [];
let actions: { robotId: string; id: number }[] = [];
let logs: { robotId: string; text: string }[] = [];
let errors: { robotId: string; message: string }[] = [];
let idles: StopReason[] = [];

function makeFleet(): Fleet {
  return new Fleet({
    createRunner: (robotId, handlers) => {
      const runner = new FakeRunner(robotId, handlers);
      created.push(runner);
      return runner;
    },
    handlers: {
      onAction: (robotId, action) => actions.push({ robotId, id: action.id }),
      onLog: (robotId, text) => logs.push({ robotId, text }),
      onError: (robotId, error) => errors.push({ robotId, message: error.message }),
      onIdle: (reason) => idles.push(reason),
    },
  });
}

const TWO = [
  { robotId: 'r1', snapshot: snapshotFor('r1', 0) },
  { robotId: 'r2', snapshot: snapshotFor('r2', 1) },
];

function runnerFor(robotId: string): FakeRunner {
  const runner = created.find((entry) => entry.robotId === robotId);
  if (!runner) throw new Error(`no runner for ${robotId}`);
  return runner;
}

beforeEach(() => {
  created = [];
  actions = [];
  logs = [];
  errors = [];
  idles = [];
});

describe('Fleet.start', () => {
  it('gives every robot the same source and its own snapshot', () => {
    const fleet = makeFleet();
    fleet.start(TWO, 'await move("north")', [], ['move']);

    expect(created).toHaveLength(2);
    expect(fleet.size).toBe(2);
    expect(fleet.robotIds()).toEqual(['r1', 'r2']);

    for (const runner of created) {
      expect(runner.starts).toHaveLength(1);
      expect(runner.starts[0]?.source).toBe('await move("north")');
      expect(runner.starts[0]?.commands).toEqual(['move']);
    }

    expect(runnerFor('r1').starts[0]?.snapshot.index).toBe(0);
    expect(runnerFor('r2').starts[0]?.snapshot.index).toBe(1);
  });

  it('is running until the last robot has stopped', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);
    expect(fleet.running).toBe(true);

    runnerFor('r1').finish();
    expect(fleet.running).toBe(true);
    expect(idles).toEqual([]);

    runnerFor('r2').finish();
    expect(fleet.running).toBe(false);
    expect(idles).toEqual(['finished']);
  });

  it('ends a previous run before starting the next one', () => {
    const fleet = makeFleet();
    fleet.start(TWO, 'first', [], []);
    fleet.start(TWO, 'second', [], []);

    expect(created).toHaveLength(4);
    expect(created[0]?.stops).toEqual(['user']);
    expect(created[2]?.starts[0]?.source).toBe('second');
  });
});

describe('Fleet routing', () => {
  it('answers the robot the action came from, and only that one', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    fleet.resolve('r2', 7, 'ok', snapshotFor('r2', 1));
    fleet.reject('r1', 8, 'blocked', snapshotFor('r1', 0));

    expect(runnerFor('r2').resolved).toEqual([{ id: 7, value: 'ok' }]);
    expect(runnerFor('r1').resolved).toEqual([]);
    expect(runnerFor('r1').rejected).toEqual([{ id: 8, message: 'blocked' }]);
    expect(runnerFor('r2').rejected).toEqual([]);
  });

  it('ignores an answer for a robot that is no longer in the fleet', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    expect(() => fleet.resolve('r9', 1, null, snapshotFor('r9', 0))).not.toThrow();
  });

  it('tags actions and logs with the robot that produced them', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    runnerFor('r2').handlers.onAction({ type: 'action', id: 1, command: 'mine', args: [], line: 2 });
    runnerFor('r1').handlers.onLog?.('hello', 4);

    expect(actions).toEqual([{ robotId: 'r2', id: 1 }]);
    expect(logs).toEqual([{ robotId: 'r1', text: 'hello' }]);
  });
});

describe('Fleet stopping', () => {
  it('stops the whole fleet when one robot fails', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    runnerFor('r1').crash('mine() found no ore');

    expect(errors).toEqual([{ robotId: 'r1', message: 'mine() found no ore' }]);
    expect(runnerFor('r2').stops).toEqual(['error']);
    expect(fleet.running).toBe(false);
    expect(idles).toEqual(['error']);
  });

  it('reports the worst reason once, not one per robot', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    runnerFor('r1').finish();
    runnerFor('r2').stop('timeout');

    expect(idles).toEqual(['timeout']);
  });

  it('announces idle a single time when the player stops the run', () => {
    const fleet = makeFleet();
    fleet.start(TWO, '', [], []);

    fleet.stop('user');

    expect(runnerFor('r1').stops).toEqual(['user']);
    expect(runnerFor('r2').stops).toEqual(['user']);
    expect(idles).toEqual(['user']);
    expect(fleet.size).toBe(0);
  });

  it('stays quiet when there is nothing to stop', () => {
    const fleet = makeFleet();
    fleet.stop('user');
    expect(idles).toEqual([]);
  });
});
