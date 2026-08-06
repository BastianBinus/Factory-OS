/**
 * Turns a stack trace into the line the player actually wrote.
 *
 * Player code is compiled with `new AsyncFunction('api', source)`, and every
 * engine wraps that body in a few lines of its own. How many differs per engine,
 * so the number is never guessed: the worker compiles a probe whose call sits on
 * a known line, reads back what the stack claims, and keeps the difference.
 *
 * If a stack cannot be parsed at all the result is `null`. Everything that shows
 * line numbers treats `null` as "unknown" and simply says nothing — a browser we
 * did not anticipate costs the highlight, never the game.
 */

export interface StackFrame {
  line: number;
  column: number;
}

/**
 * Matches the trailing `:line:column` of a frame in every engine we know:
 *   Chrome   `    at api.move (eval at run (<anonymous>:12:9), <anonymous>:4:11)`
 *   Firefox  `move@blob:http://localhost/abc:4:11`
 *   Safari   `move@blob:http://localhost/abc:4:11`
 * The `Error: message` header carries no such suffix and drops out by itself.
 */
const FRAME_TAIL = /:(\d+):(\d+)\)?$/;

export function parseFrames(stack: string | undefined): StackFrame[] {
  if (typeof stack !== 'string') return [];

  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const match = FRAME_TAIL.exec(raw.trim());
    if (!match) continue;
    const line = Number(match[1]);
    const column = Number(match[2]);
    if (Number.isFinite(line) && Number.isFinite(column)) frames.push({ line, column });
  }
  return frames;
}

/**
 * The reported line of one frame, counted from the top of the stack.
 * Depth 0 is wherever the Error was constructed.
 */
export function frameLine(stack: string | undefined, depth: number): number | null {
  const frames = parseFrames(stack);
  return frames[depth]?.line ?? null;
}

/** How far the compiled wrapper shifts every reported line. */
export class LineOffset {
  private offset: number | null = null;

  /**
   * @param reported what the stack said
   * @param actual   the line the probe's call really sits on in its own source
   */
  calibrate(reported: number | null, actual: number): boolean {
    if (reported === null) {
      this.offset = null;
      return false;
    }
    // A wrapper can only ever push lines down. Anything else means we misread
    // the stack, and a wrong highlight is worse than none.
    const offset = reported - actual;
    if (offset < 0) {
      this.offset = null;
      return false;
    }
    this.offset = offset;
    return true;
  }

  get calibrated(): boolean {
    return this.offset !== null;
  }

  /** Reported line to author line, or `null` while uncalibrated. */
  toAuthorLine(reported: number | null): number | null {
    if (this.offset === null || reported === null) return null;
    const line = reported - this.offset;
    return line >= 1 ? line : null;
  }
}
