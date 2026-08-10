import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/game/GameState';
import type { GameState } from '../src/game/types';
import { syncWithCloud } from '../src/cloud/sync';
import type { PullResult } from '../src/cloud/saveApi';

/**
 * The branch that can destroy a factory, exercised without a network.
 *
 * Every test here asserts on what did *not* happen as much as on what did: a
 * sync that adopts must not also push, and a failed read must not push at all.
 * Those are the two ways a save gets lost, and neither is visible in an outcome
 * value on its own.
 */

function stateAt(tick: number, credits: number): GameState {
  const state = createInitialState();
  state.tick = tick;
  state.credits = credits;
  return state;
}

function harness(remote: PullResult, answer: 'local' | 'cloud' = 'local') {
  const adopt = vi.fn();
  const push = vi.fn(async () => ({ ok: true }) as const);
  const ask = vi.fn(async () => answer);
  const pull = vi.fn(async () => remote);

  return { adopt, push, ask, pull };
}

describe('syncing a signed-in player', () => {
  it('uploads the local factory when the cloud has never seen one', async () => {
    const state = stateAt(120, 400);
    const bits = harness({ ok: true, state: null });

    const outcome = await syncWithCloud({ state, localSavedAt: 1000, ...bits });

    expect(outcome).toEqual({ kind: 'pushed' });
    expect(bits.push).toHaveBeenCalledWith(state);
    expect(bits.adopt).not.toHaveBeenCalled();
    expect(bits.ask).not.toHaveBeenCalled();
  });

  it('downloads the cloud factory when it contains everything the local one has', async () => {
    const cloud = stateAt(900, 5000);
    const bits = harness({ ok: true, state: cloud, savedAt: 2000 });

    const outcome = await syncWithCloud({ state: stateAt(10, 20), localSavedAt: 1000, ...bits });

    expect(outcome).toEqual({ kind: 'adopted' });
    expect(bits.adopt).toHaveBeenCalledWith(cloud);
    // Adopting and then uploading would write the cloud save back over itself.
    expect(bits.push).not.toHaveBeenCalled();
  });

  it('uploads without asking when the local factory is simply further along', async () => {
    const bits = harness({ ok: true, state: stateAt(10, 20), savedAt: 9999 });

    const outcome = await syncWithCloud({ state: stateAt(900, 5000), localSavedAt: 1, ...bits });

    expect(outcome).toEqual({ kind: 'pushed' });
    expect(bits.ask).not.toHaveBeenCalled();
  });

  it('asks when each save holds progress the other lacks, and obeys the answer', async () => {
    const cloud = stateAt(50, 9000);
    const bits = harness({ ok: true, state: cloud, savedAt: 2000 }, 'cloud');

    const outcome = await syncWithCloud({ state: stateAt(800, 30), localSavedAt: 1000, ...bits });

    expect(bits.ask).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: 'adopted' });
    expect(bits.adopt).toHaveBeenCalledWith(cloud);
  });

  it('keeps the local factory when the player answers that way', async () => {
    const bits = harness({ ok: true, state: stateAt(50, 9000), savedAt: 2000 }, 'local');
    const state = stateAt(800, 30);

    const outcome = await syncWithCloud({ state, localSavedAt: 1000, ...bits });

    expect(outcome).toEqual({ kind: 'pushed' });
    expect(bits.push).toHaveBeenCalledWith(state);
    expect(bits.adopt).not.toHaveBeenCalled();
  });

  /**
   * A read that failed says nothing about what is in the database. Uploading over
   * it would be deciding a conflict that was never even looked at.
   */
  it('touches nothing when the cloud cannot be read', async () => {
    const bits = harness({ ok: false, message: 'network down' });

    const outcome = await syncWithCloud({ state: stateAt(10, 20), localSavedAt: 1000, ...bits });

    expect(outcome).toEqual({ kind: 'failed', message: 'network down' });
    expect(bits.push).not.toHaveBeenCalled();
    expect(bits.adopt).not.toHaveBeenCalled();
  });

  it('reports a refused upload instead of claiming success', async () => {
    const bits = harness({ ok: true, state: null });
    bits.push.mockResolvedValue({ ok: false, message: 'row level security' } as never);

    const outcome = await syncWithCloud({ state: stateAt(10, 20), localSavedAt: 1000, ...bits });

    expect(outcome).toEqual({ kind: 'failed', message: 'row level security' });
  });
});
