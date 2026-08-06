/**
 * The heartbeat. One tick is one action, and the tick rate is the reward the
 * player buys upgrades for — which is why there is no speed slider anywhere.
 *
 * Time is accumulated rather than counted in frames, so the rate holds on a
 * 144 Hz screen and on a struggling one. The clock and the frame source are
 * injected, which is the only reason this can be tested without a browser.
 */

export interface TickSchedulerOptions {
  tickRateMs: number;
  onTick: (tick: number) => void;
  now?: () => number;
  schedule?: (callback: (now: number) => void) => number;
  cancel?: (handle: number) => void;
}

/**
 * A tab in the background stops getting frames and returns with a huge delta.
 * Without this cap the factory would fast-forward a minute of ticks at once.
 */
const MAX_TICKS_PER_FRAME = 5;

export class TickScheduler {
  private readonly onTick: (tick: number) => void;
  private readonly now: () => number;
  private readonly schedule: (callback: (now: number) => void) => number;
  private readonly cancel: (handle: number) => void;

  private tickRateMs: number;
  private handle: number | null = null;
  private accumulator = 0;
  private last = 0;
  private paused = false;
  private ticks = 0;

  constructor(options: TickSchedulerOptions) {
    this.onTick = options.onTick;
    this.tickRateMs = Math.max(1, options.tickRateMs);
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((callback) => requestAnimationFrame(callback));
    this.cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get tickCount(): number {
    return this.ticks;
  }

  get rate(): number {
    return this.tickRateMs;
  }

  start(): void {
    if (this.handle !== null) return;
    this.paused = false;
    this.accumulator = 0;
    this.last = this.now();
    this.request();
  }

  pause(): void {
    this.paused = true;
    this.accumulator = 0;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = this.now();
    this.accumulator = 0;
  }

  stop(): void {
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
    this.paused = false;
    this.accumulator = 0;
  }

  /** Takes effect on the next tick; a running upgrade never skips one. */
  setTickRate(ms: number): void {
    this.tickRateMs = Math.max(1, ms);
  }

  private request(): void {
    this.handle = this.schedule((now) => this.frame(now));
  }

  private frame(now: number): void {
    if (this.handle === null) return;
    this.request();

    const elapsed = now - this.last;
    this.last = now;
    if (this.paused) return;

    this.accumulator += Math.max(0, elapsed);

    let budget = MAX_TICKS_PER_FRAME;
    while (this.accumulator >= this.tickRateMs && budget > 0) {
      this.accumulator -= this.tickRateMs;
      budget -= 1;
      this.ticks += 1;
      this.onTick(this.ticks);
      // A tick can stop the scheduler — from a script error, say.
      if (this.handle === null) return;
    }

    if (budget === 0) this.accumulator = 0;
  }
}
