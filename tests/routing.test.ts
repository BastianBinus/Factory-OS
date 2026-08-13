import { describe, expect, it } from 'vitest';
import type { Direction, Grid } from '../src/game/types';
import { DIRECTIONS, setTile, step, tileAt } from '../src/game/grid';
import { move } from '../src/engine/commands';
import { expectFail, expectOk, robotOf, runTick, stateFromLayout } from './helpers';

/** A field of open ground `w` wide and `h` tall. */
function open(w: number, h: number): string[] {
  return Array.from({ length: h }, () => '.'.repeat(w));
}

/**
 * A plain breadth-first search over the grid — the reference the routing tier is
 * meant to force. Returns the directions to walk from `start` to `goal`, or null.
 */
function bfs(grid: Grid, start: { x: number; y: number }, goal: { x: number; y: number }): Direction[] | null {
  const key = (x: number, y: number): string => `${x},${y}`;
  const cameFrom = new Map<string, { x: number; y: number; dir: Direction }>();
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];

  while (queue.length > 0) {
    const here = queue.shift()!;
    if (here.x === goal.x && here.y === goal.y) {
      const path: Direction[] = [];
      let cursor = key(here.x, here.y);
      while (cameFrom.has(cursor)) {
        const prev = cameFrom.get(cursor)!;
        path.unshift(prev.dir);
        cursor = key(prev.x, prev.y);
      }
      return path;
    }
    for (const dir of DIRECTIONS) {
      const next = step(here.x, here.y, dir);
      const tile = tileAt(grid, next.x, next.y);
      if (!tile || tile.kind === 'wall' || seen.has(key(next.x, next.y))) continue;
      seen.add(key(next.x, next.y));
      cameFrom.set(key(next.x, next.y), { x: here.x, y: here.y, dir });
      queue.push(next);
    }
  }
  return null;
}

describe('walls block movement', () => {
  it('refuses to step into a wall', () => {
    const state = stateFromLayout(open(2, 1), 0, 0);
    setTile(state.grid, 1, 0, { kind: 'wall' });

    expect(expectFail(runTick(state, (ctx) => move(ctx, 'east'))).code).toBe('blocked');
    expect(robotOf(state)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('a reference BFS finds a way around', () => {
  it('routes the robot past a wall the straight path cannot cross', () => {
    const state = stateFromLayout(open(4, 4), 0, 0);
    // A wall down column 2, rows 0..2 — the only gap is at (2,3).
    setTile(state.grid, 2, 0, { kind: 'wall' });
    setTile(state.grid, 2, 1, { kind: 'wall' });
    setTile(state.grid, 2, 2, { kind: 'wall' });

    // A straight walk east would hit the wall at column 2; the search goes around.
    const path = bfs(state.grid, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).not.toBeNull();

    for (const dir of path!) expectOk(runTick(state, (ctx) => move(ctx, dir)));
    expect(robotOf(state)).toMatchObject({ x: 3, y: 0 });
  });

  it('returns null when the goal is walled off completely', () => {
    const state = stateFromLayout(open(3, 3), 0, 0);
    // Box the goal corner in.
    setTile(state.grid, 2, 1, { kind: 'wall' });
    setTile(state.grid, 1, 2, { kind: 'wall' });
    setTile(state.grid, 1, 1, { kind: 'wall' });

    expect(bfs(state.grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });
});
