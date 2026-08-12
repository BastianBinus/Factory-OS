import { describe, expect, it } from 'vitest';
import type { GroundState } from '../src/game/types';
import { INITIAL_LAYOUT, gridFromLayout } from '../src/game/GameState';
import { setTile } from '../src/game/grid';
import { gridSignature } from '../src/render/WorldView';

/**
 * The renderer rebuilds its whole static layer whenever the grid signature
 * changes. A crop ripening is the most frequent change in the game, so if it
 * moved the signature the floor would be torn down and rebuilt several times a
 * second — visible as a flicker.
 *
 * These tests hold the signature to that promise. They need no canvas: the
 * signature is a pure function of the grid.
 */

const GROUND_STATES: GroundState[] = ['raw', 'prepared', 'growing', 'ripe'];

describe('gridSignature', () => {
  it('does not change when a crop ripens', () => {
    const grid = gridFromLayout(INITIAL_LAYOUT);
    const before = gridSignature(grid);

    setTile(grid, 3, 5, {
      kind: 'ground',
      state: 'growing',
      resource: 'iron_ore',
      ripeAt: 12,
      yield: 3,
      purity: 4,
    });
    expect(gridSignature(grid)).toBe(before);

    setTile(grid, 3, 5, {
      kind: 'ground',
      state: 'ripe',
      resource: 'iron_ore',
      ripeAt: 12,
      yield: 3,
      purity: 4,
    });
    expect(gridSignature(grid)).toBe(before);
  });

  it('reads the same for every ground state', () => {
    const grid = gridFromLayout(INITIAL_LAYOUT);
    const signatures = GROUND_STATES.map((state) => {
      setTile(grid, 2, 2, {
        kind: 'ground',
        state,
        resource: state === 'raw' || state === 'prepared' ? null : 'copper_ore',
        ripeAt: null,
        yield: 0,
        purity: 0,
      });
      return gridSignature(grid);
    });

    expect(new Set(signatures).size).toBe(1);
  });

  /**
   * The counter-proof. Without it the two tests above would still pass if
   * gridSignature returned a constant.
   */
  it('changes when a tile becomes a machine', () => {
    const grid = gridFromLayout(INITIAL_LAYOUT);
    const before = gridSignature(grid);

    setTile(grid, 2, 2, {
      kind: 'machine',
      machine: 'seeder',
      input: {},
      output: {},
      job: null,
    });

    expect(gridSignature(grid)).not.toBe(before);
  });

  it('tells the three machines apart', () => {
    const grid = gridFromLayout(INITIAL_LAYOUT);

    const signatures = (['smelter', 'assembler', 'seeder'] as const).map((machine) => {
      setTile(grid, 2, 2, { kind: 'machine', machine, input: {}, output: {}, job: null });
      return gridSignature(grid);
    });

    expect(new Set(signatures).size).toBe(3);
  });
});
