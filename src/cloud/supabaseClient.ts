import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The cloud is optional, and stays optional.
 *
 * Without both environment variables the game runs exactly as it did before this
 * phase: localStorage only. That is not an error state to be reported, it is the
 * normal state of a checkout that nobody has pointed at a Supabase project. Every
 * caller here gets `null` and is expected to carry on rather than complain.
 */

const env = import.meta.env as Record<string, string | undefined>;
const url = env['VITE_SUPABASE_URL'];
const publishableKey = env['VITE_SUPABASE_PUBLISHABLE_KEY'];

let client: SupabaseClient | null = null;
let attempted = false;

export function isCloudConfigured(): boolean {
  return Boolean(url && publishableKey);
}

export function getSupabase(): SupabaseClient | null {
  if (attempted) return client;
  attempted = true;

  if (!url || !publishableKey) return null;

  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Nothing signs in through a URL here - no OAuth redirect, no magic link -
      // so there is no fragment worth parsing, and not parsing it keeps the
      // client from touching the address bar at all.
      detectSessionInUrl: false,
    },
  });

  return client;
}
