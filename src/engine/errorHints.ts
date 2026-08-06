import type { UnlockDef } from '../game/types';
import { getMission, unlockForCommand } from '../game/progression';

/**
 * Raw JavaScript errors, translated into something a beginner can act on.
 *
 * The rule this file follows: never replace a message with an invented one. If
 * nothing here recognises the error, the player sees exactly what the engine
 * said — a wrong explanation is worse than a terse correct one.
 *
 * The one case worth real effort is a name that does not exist. Because locked
 * commands are genuinely absent from the API, `scan()` fails with the same
 * honest `scan is not defined` a typo would produce, and only this file knows
 * which of the two it was.
 */

export interface RawScriptError {
  name: string;
  message: string;
  line: number | null;
}

export interface ErrorHint {
  /** The headline: what went wrong, in one sentence. */
  message: string;
  /** What to do about it. Empty when there is nothing useful to add. */
  detail: string;
  line: number | null;
}

export function explainError(error: RawScriptError, unlocked: readonly string[]): ErrorHint {
  const line = error.line;

  // The API already phrases its own errors for the player — a forgotten `await`
  // arrives here fully explained, and rewording it would only lose detail.
  if (error.name === 'ApiError' || error.name === 'TimeoutError') {
    return { message: error.message, detail: '', line };
  }

  if (error.name === 'SyntaxError') {
    return {
      message: `Syntax error: ${stripPrefix(error.message)}`,
      detail: 'Something is unbalanced — look for a missing ), } or closing quote.',
      line,
    };
  }

  if (error.name === 'RangeError' && /call stack/i.test(error.message)) {
    return {
      message: 'A function called itself until it ran out of room.',
      detail: 'Check that a recursive function has a case where it stops calling itself.',
      line,
    };
  }

  const missing = missingName(error.message);
  if (missing !== null) return explainMissingName(missing, unlocked, error);

  return { message: error.message, detail: '', line };
}

function explainMissingName(
  name: string,
  unlocked: readonly string[],
  error: RawScriptError,
): ErrorHint {
  const line = error.line;

  // The name is unlocked and still failed, so this is not the case this file
  // understands. Guessing here would send the player after the wrong problem.
  if (unlocked.includes(name)) return { message: error.message, detail: '', line };

  const unlock = unlockForCommand(name);
  if (unlock) {
    return { message: `${name}() is not unlocked yet.`, detail: shopHint(unlock), line };
  }

  const suggestion = nearestName(name, unlocked);
  if (suggestion !== null) {
    return { message: `There is no ${name}().`, detail: `Did you mean ${suggestion}()?`, line };
  }

  return {
    message: `There is no ${name}().`,
    detail: `You can use: ${[...unlocked].sort().join(', ')}.`,
    line,
  };
}

function shopHint(unlock: UnlockDef): string {
  const mission = unlock.requiresMission ? getMission(unlock.requiresMission) : undefined;
  const where = unlock.cost > 0 ? `Buy it in the Shop for ${unlock.cost} cr` : 'Unlock it in the Shop';
  return mission ? `${where}, after the mission "${mission.title}".` : `${where}.`;
}

/**
 * The identifier an engine complained about, or null. The three phrasings are
 * Chrome/Firefox, Safari, and the case where the name exists but is not callable.
 */
function missingName(message: string): string | null {
  const patterns = [
    /^([A-Za-z_$][\w$]*) is not defined/,
    /^Can't find variable: ([A-Za-z_$][\w$]*)/,
    /^(?:.*\.)?([A-Za-z_$][\w$]*) is not a function/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Browsers prefix the message of an uncaught error; the player never typed that. */
function stripPrefix(message: string): string {
  return message.replace(/^Uncaught\s+\w*Error:\s*/, '').trim() || 'the script could not be compiled.';
}

/**
 * The closest unlocked name, if it is close enough to be a typo rather than a
 * guess. Two edits is where a suggestion stops helping and starts confusing.
 */
function nearestName(name: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best !== null && bestScore <= 2 ? best : null;
}

/** Levenshtein distance, one row at a time — the words here are never long. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }

  return previous[b.length] ?? a.length;
}
