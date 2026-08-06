import { beforeEach, describe, expect, it } from 'vitest';
import { TickScheduler } from '../src/engine/TickScheduler';

/**
 * A frame source under our control. The scheduler never touches
 * `requestAnimationFrame` or `performance.now` here, which is the whole reason
 * the heartbeat can be tested without a browser.
 */
class FakeClock {
  time = 0;
  private pending: ((now: number) => void) | null = null;
  private nextHandle = 1;
  cancelled: number[] = [];

  readonly now = (): number => this.time;

  readonly schedule = (callback: (now: number) => void): number => {
    this.pending = callback;
    return this.nextHandle++;
  };

  readonly cancel = (handle: number): void => {
    this.cancelled.push(handle);
    this.pending = null;
  };

  /** Advances the clock by `ms` and delivers exactly one frame. */
  advance(ms: number): void {
    this.time += ms;
    const frame = this.pending;
    this.pending = null;
    frame?.(this.time);
  }

  get hasFrame(): boolean {
    return this.pending !== null;
  }
}

let clock: FakeClock;

function makeScheduler(tickRateMs: number, onTick: (tick: number) => void): TickScheduler {
  return new TickScheduler({
    tickRateMs,
    onTick,
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
}

beforeEach(() => {
  clock = new FakeClock();
});

describe('tick rate', () => {
  it('does not tick before the rate has elapsed', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(200, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(199);

    expect(ticks).toEqual([]);
  });

  it('ticks once the rate has elapsed', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(200, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(200);

    expect(ticks).toEqual([1]);
  });

  it('keeps the rate on a fast screen by accumulating leftovers', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    // Twelve 60 Hz-ish frames are ~200ms — exactly two ticks, no drift.
    for (let i = 0; i < 12; i += 1) clock.advance(16.6667);

    expect(ticks).toEqual([1, 2]);
  });

  it('catches up when one frame covers several ticks', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(300);

    expect(ticks).toEqual([1, 2, 3]);
  });

  it('never runs more than five ticks in one frame', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    // A backgrounded tab returns with a minute of missed time.
    clock.advance(60_000);

    expect(ticks).toEqual([1, 2, 3, 4, 5]);
  });

  it('drops the backlog after a clamped frame instead of paying it off later', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(60_000);
    ticks.length = 0;

    clock.advance(99);
    expect(ticks).toEqual([]);

    clock.advance(1);
    expect(ticks).toEqual([6]);
  });

  it('applies a new rate from the next tick on', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(400, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(400);
    scheduler.setTickRate(100);
    clock.advance(100);

    expect(ticks).toEqual([1, 2]);
    expect(scheduler.rate).toBe(100);
  });

  it('refuses a rate of zero, which would tick forever inside one frame', () => {
    const scheduler = makeScheduler(0, () => {});
    expect(scheduler.rate).toBe(1);

    scheduler.setTickRate(-50);
    expect(scheduler.rate).toBe(1);
  });
});

describe('pause and resume', () => {
  it('stops ticking while paused but keeps asking for frames', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    scheduler.pause();
    clock.advance(1000);

    expect(ticks).toEqual([]);
    expect(scheduler.isPaused).toBe(true);
    expect(clock.hasFrame).toBe(true);
  });

  it('does not fast-forward the paused time on resume', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    scheduler.pause();
    clock.advance(5000);
    scheduler.resume();

    clock.advance(99);
    expect(ticks).toEqual([]);

    clock.advance(1);
    expect(ticks).toEqual([1]);
  });

  it('ignores resume when it was never paused', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    clock.advance(50);
    scheduler.resume();
    clock.advance(50);

    expect(ticks).toEqual([1]);
  });
});

describe('lifecycle', () => {
  it('reports running only between start and stop', () => {
    const scheduler = makeScheduler(100, () => {});

    expect(scheduler.running).toBe(false);
    scheduler.start();
    expect(scheduler.running).toBe(true);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });

  it('cancels the pending frame on stop', () => {
    const scheduler = makeScheduler(100, () => {});

    scheduler.start();
    scheduler.stop();

    expect(clock.cancelled).toHaveLength(1);
    expect(clock.hasFrame).toBe(false);
  });

  it('ignores a second start instead of running two loops', () => {
    const ticks: number[] = [];
    const scheduler = makeScheduler(100, (t) => ticks.push(t));

    scheduler.start();
    scheduler.start();
    clock.advance(100);

    expect(ticks).toEqual([1]);
  });

  it('clears the paused flag on stop', () => {
    const scheduler = makeScheduler(100, () => {});

    scheduler.start();
    scheduler.pause();
    scheduler.stop();

    expect(scheduler.isPaused).toBe(false);
  });

  it('abandons the rest of the frame when a tick stops it', () => {
    const ticks: number[] = [];
    const scheduler: TickScheduler = makeScheduler(100, (t) => {
      ticks.push(t);
      scheduler.stop();
    });

    scheduler.start();
    // Worth three ticks — a script error inside the first must eat the other two.
    clock.advance(300);

    expect(ticks).toEqual([1]);
    expect(scheduler.running).toBe(false);
  });

  it('counts ticks across a stop, because the world does not reset', () => {
    const scheduler = makeScheduler(100, () => {});

    scheduler.start();
    clock.advance(200);
    scheduler.stop();
    scheduler.start();
    clock.advance(100);

    expect(scheduler.tickCount).toBe(3);
  });
});
