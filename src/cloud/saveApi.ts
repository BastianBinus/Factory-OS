import type { GameState } from '../game/types';
import { deserialize, serialize } from '../game/saveLoad';
import { getSupabase } from './supabaseClient';

/**
 * Reading and writing the one row this player owns.
 *
 * No query here filters by user id, and that is deliberate rather than sloppy:
 * row level security already restricts every statement to `auth.uid()`. Adding a
 * `.eq('user_id', ...)` would suggest the filter is what protects the data, when
 * in fact the database would refuse just as firmly without it. The security
 * boundary is in the migration, not in this file.
 *
 * A cloud save is put through the same `deserialize` as a local one, so it gets
 * the same version migration and the same refusal to trust its own contents.
 */

const TABLE = 'game_saves';

export type PullResult =
  | { ok: true; state: GameState; savedAt: number }
  | { ok: true; state: null }
  | { ok: false; message: string };

export type PushResult = { ok: true } | { ok: false; message: string };

export async function pullSave(): Promise<PullResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'The cloud is not configured.' };

  const { data, error } = await supabase
    .from(TABLE)
    .select('state, updated_at')
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: true, state: null };

  const result = deserialize(JSON.stringify(data.state));
  if (!result.ok) {
    return { ok: false, message: `The cloud save could not be read: ${result.message}` };
  }

  const savedAt = Date.parse(String(data.updated_at));
  return { ok: true, state: result.state, savedAt: Number.isFinite(savedAt) ? savedAt : 0 };
}

export async function pushSave(state: GameState): Promise<PushResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'The cloud is not configured.' };

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) return { ok: false, message: 'Not signed in.' };

  // updated_at is left out on purpose - a trigger owns it, and a client that
  // could set it could also win every conflict by lying about the time.
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: data.user.id, state: JSON.parse(serialize(state)) as unknown });

  return error ? { ok: false, message: error.message } : { ok: true };
}
