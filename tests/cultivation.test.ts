import { describe, expect, it } from 'vitest';
import type { GameState, Grid, GroundTile, ResourceId } from '../src/game/types';
import {
  BASE_YIELD,
  GROW_TICKS,
  isSeedable,
  neighbourBonus,
  purityFor,
  ripen,
  yieldFor,
} from '../src/game/cultivation';
import { setTile } from '../src/game/grid';
import { createInitialState } from '../src/game/GameState';
import { oreCount } from '../src/game/batches';
import { clear, mine, scan, seed } from '../src/engine/commands';
import { ctxOf, expectFail, expectOk, idle, runTick, stateFromLayout } from './helpers';

function ground(state: GroundTile['state'], resource: ResourceId | null = null): GroundTile {
  return { kind: 'ground', state, resource, ripeAt: null, yield: 0, purity: 0 };
}

function bareGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ground('raw')),
  };
}

describe('isSeedable', () => {
  it('accepts the two ores and nothing else', () => {
    expect(isSeedable('iron_ore')).toBe(true);
    expect(isSeedable('copper_ore')).toBe(true);
    expect(isSeedable('iron_ingot')).toBe(false);
    expect(isSeedable('seed_crystal')).toBe(false);
  });

  it('gives copper a longer season than iron', () => {
    expect(GROW_TICKS.copper_ore).toBeGreaterThan(GROW_TICKS.iron_ore ?? 0);
  });
});

describe('neighbourBonus', () => {
  it('counts only the four orthogonal neighbours growing the same crop', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('growing', 'iron_ore'));
    setTile(grid, 0, 1, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 1, ground('growing', 'copper_ore'));
    setTile(grid, 1, 2, ground('prepared', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(2);
  });

  it('does not count diagonals', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 0, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 2, 2, ground('ripe', 'iron_ore'));

    expect(neighbourBonus(grid, 1, 1, 'iron_ore')).toBe(0);
  });

  it('treats the edge of the factory as no neighbour, not as an error', () => {
    const grid = bareGrid(1, 1);
    expect(neighbourBonus(grid, 0, 0, 'iron_ore')).toBe(0);
  });
});

describe('yieldFor', () => {
  it('pays the base yield on a lonely tile', () => {
    expect(yieldFor(bareGrid(3, 3), 1, 1, 'iron_ore')).toBe(BASE_YIELD);
  });

  it('pays one more per matching neighbour', () => {
    const grid = bareGrid(3, 3);
    setTile(grid, 1, 0, ground('ripe', 'iron_ore'));
    setTile(grid, 1, 2, ground('ripe', 'iron_ore'));

    expect(yieldFor(grid, 1, 1, 'iron_ore')).toBe(BASE_YIELD + 2);
  });
});

describe('purityFor', () => {
  it('stays inside 1..10', () => {
    for (let tick = 0; tick < 50; tick += 1) {
      for (let x = 0; x < 8; x += 1) {
        const purity = purityFor(x, x + 1, tick);
        expect(purity).toBeGreaterThanOrEqual(1);
        expect(purity).toBeLessThanOrEqual(10);
      }
    }
  });

  it('is deterministic in the tile and the moment', () => {
    expect(purityFor(3, 4, 12)).toBe(purityFor(3, 4, 12));
  });

  it('is not the same for every tile', () => {
    const values = new Set([purityFor(0, 0, 0), purityFor(1, 0, 0), purityFor(0, 1, 0)]);
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('ripen', () => {
  function stateWith(grid: Grid, tick: number): GameState {
    const state = createInitialState();
    state.grid = grid;
    state.tick = tick;
    return state;
  }

  it('ripens only crops whose tick has arrived', () => {
    const grid = bareGrid(2, 1);
    const early: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 10 };
    const late: GroundTile = { ...ground('growing', 'iron_ore'), ripeAt: 40 };
    setTile(grid, 0, 0, early);
    setTile(grid, 1, 0, late);

    const ripened = ripen(stateWith(grid, 10));

    expect(ripened).toHaveLength(1);
    expect(early.state).toBe('ripe');
    expect(early.ripeAt).toBeNull();
    expect(late.state).toBe('growing');
  });

  it('leaves raw, prepared and already ripe ground alone', () => {
    const grid = bareGrid(3, 1);
    setTile(grid, 0, 0, ground('raw'));
    setTile(grid, 1, 0, ground('prepared'));
    setTile(grid, 2, 0, { ...ground('ripe', 'iron_ore'), yield: 3 });

    expect(ripen(stateWith(grid, 9999))).toHaveLength(0);
  });
});

describe('clear', () => {
  it('turns raw ground into prepared ground', () => {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;

    expectOk(runTick(state, clear));

    expect(state.grid.tiles[4]).toMatchObject({ kind: 'ground', state: 'prepared' });
  });

  it('refuses ground that is already prepared', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;

    expectOk(runTick(state, clear));
    const result = expectFail(runTick(state, clear));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('prepared');
  });

  it('refuses a tile that is not ground at all', () => {
    const state = stateFromLayout(['M'], 0, 0);
    expect(expectFail(runTick(state, clear)).code).toBe('nothing_here');
  });
});

describe('seed', () => {
  function preparedState(): GameState {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;
    state.robots[0]!.inventory = { seed_crystal: 1 };
    expectOk(runTick(state, clear));
    return state;
  }

  it('plants a crop, spends the crystal and books the ripe tick', () => {
    const state = preparedState();

    expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(state.grid.tiles[4]).toMatchObject({
      kind: 'ground',
      state: 'growing',
      resource: 'iron_ore',
      ripeAt: state.tick + (GROW_TICKS.iron_ore ?? 0),
      yield: BASE_YIELD,
    });
    expect(state.robots[0]!.inventory.seed_crystal).toBeUndefined();
  });

  it('gives the tile a purity so the sorting bay has something to sort', () => {
    const state = preparedState();
    expectOk(runTick(state, (ctx) => seed(ctx, 'copper_ore')));

    const tile = state.grid.tiles[4] as GroundTile;
    expect(tile.purity).toBe(purityFor(1, 1, state.tick));
  });

  it('will not plant on raw ground', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    state.robots[0]!.inventory = { seed_crystal: 1 };

    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('cleared');
  });

  it('refuses a resource that cannot be grown', () => {
    const state = preparedState();
    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'gear')));

    expect(result.code).toBe('bad_argument');
    expect(result.error).toContain('iron_ore');
  });

  it('refuses when the robot has no crystal, and says where to get one', () => {
    const state = preparedState();
    state.robots[0]!.inventory = {};

    const result = expectFail(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect(result.code).toBe('missing_input');
    expect(result.error).toContain('seeder');
  });

  it('pays the adjacency bonus at seeding time', () => {
    const state = preparedState();
    setTile(state.grid, 1, 0, { ...ground('ripe', 'iron_ore'), yield: 3 });
    setTile(state.grid, 0, 1, { ...ground('growing', 'iron_ore'), ripeAt: 99 });

    expectOk(runTick(state, (ctx) => seed(ctx, 'iron_ore')));

    expect((state.grid.tiles[4] as GroundTile).yield).toBe(BASE_YIELD + 2);
  });
});

describe('ripening inside advanceWorld', () => {
  it('turns a crop ripe on the tick it was booked for, not before', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'iron_ore'), ripeAt: 4, yield: 5 });

    idle(state, 3);
    expect(state.grid.tiles[0]).toMatchObject({ state: 'growing' });

    idle(state, 1);
    expect(state.grid.tiles[0]).toMatchObject({ state: 'ripe', ripeAt: null });
  });

  it('leaves the yield alone, so the harvest pays what seeding promised', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'copper_ore'), ripeAt: 1, yield: 5, purity: 7 });

    idle(state, 1);

    expect(state.grid.tiles[0]).toMatchObject({ state: 'ripe', yield: 5, purity: 7 });
  });

  it('does not touch ground that was never seeded', () => {
    const state = createInitialState();
    state.grid = bareGrid(2, 1);
    setTile(state.grid, 1, 0, ground('prepared'));

    idle(state, 50);

    expect(state.grid.tiles[0]).toMatchObject({ state: 'raw' });
    expect(state.grid.tiles[1]).toMatchObject({ state: 'prepared' });
  });
});

describe('mine on cultivated ground', () => {
  function ripeState(tile: Partial<GroundTile> = {}): GameState {
    const state = createInitialState();
    state.grid = bareGrid(3, 3);
    setTile(state.grid, 1, 1, { ...ground('ripe', 'iron_ore'), yield: 3, purity: 4, ...tile });
    state.robots[0]!.x = 1;
    state.robots[0]!.y = 1;
    state.robots[0]!.inventory = {};
    return state;
  }

  it('hands over the whole yield in one tick, plus a seed crystal', () => {
    const state = ripeState();

    const result = expectOk(runTick(state, mine));

    expect(result.value).toBe('iron_ore');
    expect(state.robots[0]!.inventory).toEqual({ seed_crystal: 1 });
    expect(oreCount(state.robots[0]!, 'iron_ore')).toBe(3);
    expect(state.stats.oreMined).toBe(3);
  });

  it('pays the yield the tile was seeded with, not a fixed number', () => {
    const state = ripeState({ yield: 6 });

    expectOk(runTick(state, mine));

    expect(state.robots[0]!.inventory).toEqual({ seed_crystal: 1 });
    expect(oreCount(state.robots[0]!, 'iron_ore')).toBe(6);
  });

  /*
   * The crystal is what makes replanting free. If a harvest could arrive without
   * one because the robot happened to be nearly full, the player would lose a
   * crystal to a rounding rule they never see — so a harvest is all or nothing.
   */
  it('refuses the harvest unless there is room for the crystal too', () => {
    const state = ripeState();
    state.inventoryCapacity = 3;

    const result = expectFail(runTick(state, mine));

    expect(result.code).toBe('inventory_full');
    expect(state.robots[0]!.inventory).toEqual({});
    expect(state.grid.tiles[4]).toMatchObject({ state: 'ripe' });
  });

  it('leaves the tile raw, so the cycle has to start again', () => {
    const state = ripeState();

    expectOk(runTick(state, mine));

    expect(state.grid.tiles[4]).toEqual({
      kind: 'ground',
      state: 'raw',
      resource: null,
      ripeAt: null,
      yield: 0,
      purity: 0,
    });
  });

  it('says the crop is not ready while it is still growing', () => {
    const state = ripeState({ state: 'growing', ripeAt: 99 });

    const result = expectFail(runTick(state, mine));

    expect(result.code).toBe('not_ready');
    expect(result.error).toContain('growing');
  });

  it('says there is nothing there on raw and prepared ground', () => {
    const raw = ripeState({ state: 'raw', resource: null });
    expect(expectFail(runTick(raw, mine)).code).toBe('nothing_here');

    const prepared = ripeState({ state: 'prepared', resource: null });
    expect(expectFail(runTick(prepared, mine)).code).toBe('nothing_here');
  });
});

describe('scan on cultivated ground', () => {
  function scanAtOrigin(tile: GroundTile): Record<string, unknown> {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, tile);
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    return expectOk(scan(ctxOf(state))).value as Record<string, unknown>;
  }

  it('describes raw ground as ground with nothing on it', () => {
    expect(scanAtOrigin(ground('raw'))).toEqual({
      type: 'ground',
      x: 0,
      y: 0,
      state: 'raw',
      resource: null,
      ripeIn: 0,
      yield: 0,
      purity: 0,
    });
  });

  /*
   * ripeIn, not ripeAt. A script that reads an absolute tick has to know the
   * current tick to do anything with it; a countdown is directly usable.
   */
  it('counts down to ripe instead of naming an absolute tick', () => {
    const state = createInitialState();
    state.grid = bareGrid(1, 1);
    setTile(state.grid, 0, 0, { ...ground('growing', 'copper_ore'), ripeAt: 12 });
    state.robots[0]!.x = 0;
    state.robots[0]!.y = 0;
    state.tick = 4;

    const value = expectOk(scan(ctxOf(state))).value as Record<string, unknown>;

    expect(value).toMatchObject({ state: 'growing', resource: 'copper_ore', ripeIn: 8 });
  });

  it('reports the yield and purity a ripe tile is about to hand over', () => {
    const value = scanAtOrigin({ ...ground('ripe', 'iron_ore'), yield: 5, purity: 9 });

    expect(value).toMatchObject({ state: 'ripe', resource: 'iron_ore', yield: 5, purity: 9, ripeIn: 0 });
  });
});
