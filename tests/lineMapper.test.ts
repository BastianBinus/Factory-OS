import { describe, expect, it } from 'vitest';
import { LineOffset, frameLine, parseFrames } from '../src/engine/lineMapper';

/*
 * The stacks below are real shapes, typed out rather than captured: the point of
 * the parser is to survive engines this test suite will never run in. Every
 * sample has the player's `await move('north')` on author line 4, compiled with a
 * wrapper that pushes it to reported line 6.
 */

const CHROME = [
  'Error',
  '    at request (http://localhost:5173/src/worker/api.ts:78:19)',
  '    at Object.move (http://localhost:5173/src/worker/api.ts:112:12)',
  '    at <anonymous>:6:11',
  '    at run (http://localhost:5173/src/worker/sandbox.worker.ts:143:24)',
].join('\n');

const FIREFOX = [
  'request@http://localhost:5173/src/worker/api.ts:78:19',
  'move@http://localhost:5173/src/worker/api.ts:112:12',
  '@blob:http://localhost:5173/6f0e2c9a-1b3d-4f77-9a12-6c1f0d4e88b1:6:11',
  'run@http://localhost:5173/src/worker/sandbox.worker.ts:143:24',
].join('\n');

const SAFARI = [
  'request@http://localhost:5173/src/worker/api.ts:78:19',
  'move@http://localhost:5173/src/worker/api.ts:112:12',
  'anonymous@:6:11',
  'run@http://localhost:5173/src/worker/sandbox.worker.ts:143:24',
].join('\n');

describe('parseFrames', () => {
  it('reads a Chrome stack and drops the Error header', () => {
    expect(parseFrames(CHROME)).toEqual([
      { line: 78, column: 19 },
      { line: 112, column: 12 },
      { line: 6, column: 11 },
      { line: 143, column: 24 },
    ]);
  });

  it('reads a Firefox stack, which has no header at all', () => {
    expect(parseFrames(FIREFOX)).toEqual([
      { line: 78, column: 19 },
      { line: 112, column: 12 },
      { line: 6, column: 11 },
      { line: 143, column: 24 },
    ]);
  });

  it('reads a Safari stack', () => {
    expect(parseFrames(SAFARI)).toEqual([
      { line: 78, column: 19 },
      { line: 112, column: 12 },
      { line: 6, column: 11 },
      { line: 143, column: 24 },
    ]);
  });

  it('returns nothing for a stack it cannot read', () => {
    expect(parseFrames(undefined)).toEqual([]);
    expect(parseFrames('')).toEqual([]);
    expect(parseFrames('some engine we have never met')).toEqual([]);
  });

  it('ignores frames without a line:column tail', () => {
    const stack = ['Error: boom', '    at native code', '    at eval (<anonymous>:6:11)'].join('\n');
    expect(parseFrames(stack)).toEqual([{ line: 6, column: 11 }]);
  });
});

describe('frameLine', () => {
  it('counts depth from the top of the stack', () => {
    expect(frameLine(CHROME, 0)).toBe(78);
    expect(frameLine(CHROME, 2)).toBe(6);
  });

  it('is null past the end of the stack', () => {
    expect(frameLine(CHROME, 99)).toBeNull();
    expect(frameLine(undefined, 0)).toBeNull();
  });
});

describe('LineOffset', () => {
  it('starts uncalibrated and reports nothing', () => {
    const offset = new LineOffset();

    expect(offset.calibrated).toBe(false);
    expect(offset.toAuthorLine(6)).toBeNull();
  });

  it('learns the wrapper offset from a probe on a known line', () => {
    const offset = new LineOffset();

    // The probe's call really sits on line 2; the stack claims 4.
    expect(offset.calibrate(4, 2)).toBe(true);
    expect(offset.calibrated).toBe(true);
    expect(offset.toAuthorLine(6)).toBe(4);
  });

  it('handles an engine that adds no wrapper lines', () => {
    const offset = new LineOffset();

    expect(offset.calibrate(2, 2)).toBe(true);
    expect(offset.toAuthorLine(6)).toBe(6);
  });

  it('refuses a negative offset rather than pointing at a wrong line', () => {
    const offset = new LineOffset();

    // A wrapper can only push lines down, so this reading was a misparse.
    expect(offset.calibrate(1, 2)).toBe(false);
    expect(offset.calibrated).toBe(false);
    expect(offset.toAuthorLine(6)).toBeNull();
  });

  it('stays silent when the probe produced no line at all', () => {
    const offset = new LineOffset();

    expect(offset.calibrate(null, 2)).toBe(false);
    expect(offset.calibrated).toBe(false);
    expect(offset.toAuthorLine(6)).toBeNull();
  });

  it('forgets a good calibration when a later one fails', () => {
    const offset = new LineOffset();

    offset.calibrate(4, 2);
    offset.calibrate(null, 2);

    expect(offset.calibrated).toBe(false);
    expect(offset.toAuthorLine(6)).toBeNull();
  });

  it('is null for a reported line that maps above the first line', () => {
    const offset = new LineOffset();

    offset.calibrate(10, 2);
    expect(offset.toAuthorLine(4)).toBeNull();
    expect(offset.toAuthorLine(9)).toBe(1);
  });

  it('passes a missing reported line straight through', () => {
    const offset = new LineOffset();

    offset.calibrate(4, 2);
    expect(offset.toAuthorLine(null)).toBeNull();
  });

  it('maps a real stack end to end', () => {
    const offset = new LineOffset();

    // Calibration probe: same wrapper, call on author line 2, reported as 4.
    offset.calibrate(4, 2);

    // Depth 2 is the player's own frame in all three samples above.
    expect(offset.toAuthorLine(frameLine(CHROME, 2))).toBe(4);
    expect(offset.toAuthorLine(frameLine(FIREFOX, 2))).toBe(4);
    expect(offset.toAuthorLine(frameLine(SAFARI, 2))).toBe(4);
  });
});
