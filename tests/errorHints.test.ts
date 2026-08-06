import { describe, expect, it } from 'vitest';
import { explainError } from '../src/engine/errorHints';
import { getMission, getUnlock } from '../src/game/progression';

/** What a fresh save can call. Everything else is genuinely absent from the API. */
const STARTING = ['credits', 'inventory', 'mine', 'move', 'position', 'print', 'reset'];

describe('locked commands', () => {
  it('turns a missing name into a pointer at the shop', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'scan is not defined', line: 4 },
      STARTING,
    );

    expect(hint.message).toBe('scan() is not unlocked yet.');
    expect(hint.detail).toContain(`${getUnlock('scan')?.cost} cr`);
    expect(hint.line).toBe(4);
  });

  it('names the mission that stands in the way', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'scan is not defined', line: 1 },
      STARTING,
    );

    expect(hint.detail).toContain(getMission('m2_mine')!.title);
  });

  it('reads the same complaint from Safari', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: "Can't find variable: sell", line: 2 },
      STARTING,
    );

    expect(hint.message).toBe('sell() is not unlocked yet.');
  });

  it('reads it from a call that resolved to something uncallable', () => {
    const hint = explainError(
      { name: 'TypeError', message: 'craft is not a function', line: 9 },
      STARTING,
    );

    expect(hint.message).toBe('craft() is not unlocked yet.');
  });
});

describe('typos', () => {
  it('suggests the nearest unlocked name', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'mve is not defined', line: 3 },
      STARTING,
    );

    expect(hint.message).toBe('There is no mve().');
    expect(hint.detail).toBe('Did you mean move()?');
  });

  it('lists what is available when nothing is close enough to guess', () => {
    const hint = explainError(
      { name: 'ReferenceError', message: 'teleport is not defined', line: 3 },
      STARTING,
    );

    expect(hint.detail).toContain('move');
    expect(hint.detail).not.toContain('Did you mean');
  });

  it('stays quiet about a name the player already owns', () => {
    // move() exists, so whatever went wrong is not something this file knows —
    // sending the player to the shop would point at the wrong problem entirely.
    const hint = explainError(
      { name: 'TypeError', message: 'move is not a function', line: 1 },
      STARTING,
    );

    expect(hint).toEqual({ message: 'move is not a function', detail: '', line: 1 });
  });
});

describe('messages that already speak to the player', () => {
  it('leaves a forgotten await exactly as the API phrased it', () => {
    const message =
      "mine() was called while move() was still running. Did you forget 'await' on line 4?";

    const hint = explainError({ name: 'ApiError', message, line: 5 }, STARTING);

    expect(hint).toEqual({ message, detail: '', line: 5 });
  });

  it('leaves the endless-loop warning alone', () => {
    const message = 'Your script ran for 2 seconds without performing an action.';
    const hint = explainError({ name: 'TimeoutError', message, line: null }, STARTING);
    expect(hint.message).toBe(message);
  });
});

describe('other engine errors', () => {
  it('explains a syntax error without hiding what the engine said', () => {
    const hint = explainError(
      { name: 'SyntaxError', message: "Uncaught SyntaxError: Unexpected token ')'", line: null },
      STARTING,
    );

    expect(hint.message).toBe("Syntax error: Unexpected token ')'");
    expect(hint.detail).toContain('quote');
    expect(hint.line).toBeNull();
  });

  it('explains a blown call stack', () => {
    const hint = explainError(
      { name: 'RangeError', message: 'Maximum call stack size exceeded', line: 12 },
      STARTING,
    );

    expect(hint.message).toContain('called itself');
    expect(hint.line).toBe(12);
  });

  it('repeats an error it does not recognise rather than inventing one', () => {
    const hint = explainError(
      { name: 'Error', message: 'the reactor went critical', line: 7 },
      STARTING,
    );

    expect(hint).toEqual({ message: 'the reactor went critical', detail: '', line: 7 });
  });
});
