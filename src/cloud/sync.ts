import type { GameState } from '../game/types';
import { resolveSaves, summarise, type SaveSummary } from './conflict';
import { pullSave, pushSave, type PullResult, type PushResult } from './saveApi';

/**
 * What happens the moment someone signs in: one save is in the browser, another
 * may be in the database, and exactly one of them is about to be the truth.
 *
 * The decision itself is `conflict.ts` and is pure. This file is the plumbing
 * around it, and its one rule is that nothing is overwritten until the winner is
 * known. It never writes to the state object either - it hands the cloud save to
 * `adopt` and lets the caller install it, because reframing the camera and
 * refilling the editor are not this module's business.
 *
 * `pull` and `push` are injectable purely so the branch that can destroy a
 * factory is testable without a network.
 */

export interface SyncDeps {
  state: GameState;
  /** Epoch milliseconds of the local save, for phrasing the question only. */
  localSavedAt: number;
  /** Asked only when neither save contains the other. */
  ask: (local: SaveSummary, cloud: SaveSummary) => Promise<'local' | 'cloud'>;
  /** Called with the cloud save when it wins. */
  adopt: (state: GameState) => void;
  pull?: () => Promise<PullResult>;
  push?: (state: GameState) => Promise<PushResult>;
}

export type SyncOutcome =
  | { kind: 'pushed' }
  | { kind: 'adopted' }
  | { kind: 'failed'; message: string };

export async function syncWithCloud(deps: SyncDeps): Promise<SyncOutcome> {
  const pull = deps.pull ?? pullSave;
  const push = deps.push ?? pushSave;

  const remote = await pull();
  if (!remote.ok) return { kind: 'failed', message: remote.message };

  const cloud = remote.state === null ? null : summarise(remote.state, remote.savedAt);
  const local = summarise(deps.state, deps.localSavedAt);

  const resolution = resolveSaves(local, cloud);
  const choice =
    resolution.kind === 'ask' ? await deps.ask(resolution.local, resolution.cloud) : resolution.kind;

  if (choice === 'cloud' && remote.state !== null) {
    deps.adopt(remote.state);
    return { kind: 'adopted' };
  }

  const written = await push(deps.state);
  return written.ok ? { kind: 'pushed' } : { kind: 'failed', message: written.message };
}
