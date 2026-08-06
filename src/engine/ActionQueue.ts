/**
 * Actions waiting for a tick, one lane per robot.
 *
 * A script can only ever have one action in flight — it is awaiting the promise
 * — so a lane holds at most one entry. The queue still exists as its own thing
 * because a second robot in phase 5 gets its own lane, and because the tick loop
 * should never have to reach into the worker bridge to find its work.
 */

export interface QueuedAction {
  /** Correlates with the promise the worker is waiting on. */
  id: number;
  robotId: string;
  command: string;
  args: unknown[];
  line: number | null;
}

export class ActionQueue {
  private readonly lanes = new Map<string, QueuedAction[]>();

  push(action: QueuedAction): void {
    const lane = this.lanes.get(action.robotId);
    if (lane) lane.push(action);
    else this.lanes.set(action.robotId, [action]);
  }

  /** Removes and returns the next action for one robot. */
  take(robotId: string): QueuedAction | undefined {
    return this.lanes.get(robotId)?.shift();
  }

  has(robotId: string): boolean {
    return (this.lanes.get(robotId)?.length ?? 0) > 0;
  }

  get size(): number {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.length;
    return total;
  }

  /** Everything still queued, so a stop can settle the promises behind them. */
  drain(): QueuedAction[] {
    const all: QueuedAction[] = [];
    for (const lane of this.lanes.values()) all.push(...lane);
    this.lanes.clear();
    return all;
  }

  clear(): void {
    this.lanes.clear();
  }
}
