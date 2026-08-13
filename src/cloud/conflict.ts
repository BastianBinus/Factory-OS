import type { GameState } from '../game/types';
import { totalResources } from '../game/economy';
import { totalItems } from '../game/resources';

/**
 * Deciding which save survives when the browser and the cloud disagree.
 *
 * The plan for this phase said "newest wins, by updated_at". That was written
 * before it was obvious that the two timestamps come from different clocks: the
 * cloud row is stamped by Postgres, the local save by whatever the machine thinks
 * the time is. One laptop with a wrong clock would then win every conflict
 * forever, and silently.
 *
 * So progress decides instead, and only when the answer is unambiguous. If one
 * save contains everything the other has, taking it loses nothing and it is taken
 * without a word. If each one holds progress the other lacks, nothing here is
 * qualified to choose - the player is asked. A factory is never thrown away to
 * save someone a click.
 *
 * Timestamps are still carried, purely so the question can be asked in terms a
 * human recognises ("this morning" rather than "tick 4120").
 */

export type SaveSummary = {
  /** Epoch milliseconds. Zero means unknown, which sorts oldest. */
  savedAt: number;
  tick: number;
  /** Everything the fleet carries — the currency now, in place of credits. */
  resources: number;
  /** How many tech-tree nodes are owned. The one axis that only ever climbs. */
  unlocks: number;
};

export type Resolution =
  | { kind: 'local' }
  | { kind: 'cloud' }
  | { kind: 'ask'; local: SaveSummary; cloud: SaveSummary };

export function summarise(state: GameState, savedAt: number): SaveSummary {
  return {
    savedAt,
    tick: state.tick,
    resources: totalItems(totalResources(state)),
    unlocks: state.unlocks.length,
  };
}

/** True when `a` is at least as far along as `b` on every axis. */
function covers(a: SaveSummary, b: SaveSummary): boolean {
  return a.tick >= b.tick && a.resources >= b.resources && a.unlocks >= b.unlocks;
}

export function resolveSaves(
  local: SaveSummary | null,
  cloud: SaveSummary | null,
): Resolution {
  if (!cloud) return { kind: 'local' };
  if (!local) return { kind: 'cloud' };

  // Identical saves land here too, and answer 'local' - there is nothing to
  // download, and swapping the state for an equal one would only cost a redraw.
  if (covers(local, cloud)) return { kind: 'local' };
  if (covers(cloud, local)) return { kind: 'cloud' };

  return { kind: 'ask', local, cloud };
}
