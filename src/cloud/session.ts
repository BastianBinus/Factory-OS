import { getSupabase } from './supabaseClient';

/**
 * Signing up, signing in, signing out. Nothing about saves lives here.
 *
 * Every function answers with a plain result rather than throwing, because none
 * of these failures are exceptional: a typo in an address, a password six
 * characters short and a project with no cloud configured are all ordinary
 * Tuesday, and the panel above wants a sentence to show, not a stack trace.
 *
 * The two obvious mistakes are caught before the network is touched. Not to save
 * a request - to give an answer that names the actual problem, which
 * "Invalid login credentials" never does.
 */

export type AuthResult = { ok: true; email: string } | { ok: false; message: string };

/** Supabase's own default. Repeated here only so the message can say the number. */
const MIN_PASSWORD = 6;

const NO_CLOUD = 'This build has no cloud configured, so the game saves in this browser only.';

export async function currentEmail(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: NO_CLOUD };

  const problem = validate(email, password);
  if (problem) return { ok: false, message: problem };

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };

  // With email confirmation switched on there is a user but no session yet. The
  // account exists, it simply cannot be used until the link is clicked, and
  // saying so beats a silent nothing-happened.
  if (!data.session) {
    return { ok: false, message: 'Account created. Confirm it from the email that was just sent, then sign in.' };
  }

  return { ok: true, email: data.session.user.email ?? email };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: NO_CLOUD };

  const problem = validate(email, password);
  if (problem) return { ok: false, message: problem };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  if (!data.session) return { ok: false, message: 'Signing in did not return a session.' };

  return { ok: true, email: data.session.user.email ?? email };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

function validate(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That does not look like an email address.';
  if (password.length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters.`;
  return null;
}
