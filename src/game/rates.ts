import type { GameState, RateSample, StageId } from './types';

/**
 * Throughput: how much the factory makes, per stage, over time.
 *
 * The production sites (harvest, seed, machine completion) call `count` as they
 * run; the tick loop calls `recordSample` when the tick closes, which freezes
 * that tick's tally into the ring buffer and clears it for the next one. Reading
 * a rate is then just summing the buffer over a time window — no side effects,
 * no canvas, testable on a hand-built state.
 */

/** The stages the meter shows, in the order material flows through them. */
export const STAGES: StageId[] = ['seed', 'mine', 'smelt', 'assemble'];

/** Most samples kept. At 250 ms/tick that is a full minute; faster, a little less. */
export const HISTORY_LIMIT = 240;

const WINDOW_MS = 60_000;

/** Adds to what the current tick has produced. Called from the engine, mid-tick. */
export function count(state: GameState, stage: StageId, amount: number): void {
  if (amount <= 0) return;
  state.tickProduced[stage] = (state.tickProduced[stage] ?? 0) + amount;
}

/** Closes the tick: freeze its tally into history, drop the oldest, start fresh. */
export function recordSample(state: GameState): void {
  state.history.push({ tick: state.tick, produced: { ...state.tickProduced } });
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.tickProduced = {};
}

export interface StageRate {
  stage: StageId;
  /** Units per minute over the window. */
  perMinute: number;
}

export interface RateReport {
  /** Per stage, in flow order. */
  stages: StageRate[];
  /** Every stage added together, units per minute. */
  totalPerMinute: number;
  /** Total this window minus total the window before it. The meter's arrow. */
  delta: number;
}

/** Sums a slice of samples into per-stage totals. */
function sumOver(samples: RateSample[]): Record<StageId, number> {
  const totals = { seed: 0, mine: 0, smelt: 0, assemble: 0 };
  for (const sample of samples) {
    for (const stage of STAGES) totals[stage] += sample.produced[stage] ?? 0;
  }
  return totals;
}

/**
 * The rate over the last `windowMs`, and how it compares to the window before.
 *
 * Ticks map to wall time through `tickRateMs`, so the window is a count of ticks,
 * not of samples — which keeps the meter honest when the clock speeds up.
 */
export function windowRate(
  history: RateSample[],
  tickRateMs: number,
  windowMs: number = WINDOW_MS,
): RateReport {
  const windowTicks = Math.max(1, Math.round(windowMs / Math.max(1, tickRateMs)));
  const now = history.length > 0 ? (history[history.length - 1]?.tick ?? 0) : 0;

  const current = history.filter((sample) => sample.tick > now - windowTicks);
  const previous = history.filter(
    (sample) => sample.tick > now - 2 * windowTicks && sample.tick <= now - windowTicks,
  );

  const perMinuteFactor = WINDOW_MS / windowMs;
  const currentTotals = sumOver(current);
  const previousTotals = sumOver(previous);

  const stages = STAGES.map((stage) => ({
    stage,
    perMinute: Math.round(currentTotals[stage] * perMinuteFactor),
  }));

  const currentTotal = STAGES.reduce((sum, stage) => sum + currentTotals[stage], 0);
  const previousTotal = STAGES.reduce((sum, stage) => sum + previousTotals[stage], 0);

  return {
    stages,
    totalPerMinute: Math.round(currentTotal * perMinuteFactor),
    delta: Math.round((currentTotal - previousTotal) * perMinuteFactor),
  };
}

export interface Bottleneck {
  stage: StageId;
  reason: string;
}

/** Which machine stage a machine tile feeds. */
const MACHINE_STAGE: Partial<Record<string, StageId>> = {
  smelter: 'smelt',
  assembler: 'assemble',
};

/**
 * The first machine stage that has raw material waiting but is producing nothing.
 *
 * Deliberately simple: if there is input sitting in a machine of that stage (or
 * ore in a robot that the stage could consume) yet the window shows zero output,
 * something is stopping the flow — too few machines, or a script that never fires
 * them. It names that stage; belts and a real upstream balance arrive in 10d–10f.
 */
export function bottleneck(state: GameState): Bottleneck | null {
  const rate = windowRate(state.history, state.tickRateMs);
  const perStage = new Map(rate.stages.map((entry) => [entry.stage, entry.perMinute]));

  for (const stage of STAGES) {
    if (stage !== 'smelt' && stage !== 'assemble') continue;
    if ((perStage.get(stage) ?? 0) > 0) continue;
    if (!hasWaitingInput(state, stage)) continue;
    return {
      stage,
      reason: `${stage} is starved: material is waiting but nothing is coming out.`,
    };
  }
  return null;
}

function hasWaitingInput(state: GameState, stage: StageId): boolean {
  for (const tile of state.grid.tiles) {
    if (tile.kind !== 'machine') continue;
    if (MACHINE_STAGE[tile.machine] !== stage) continue;
    if (Object.keys(tile.input).length > 0) return true;
  }
  return false;
}
