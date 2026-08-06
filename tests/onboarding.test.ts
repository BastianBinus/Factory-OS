import { describe, expect, it } from 'vitest';
import { STARTER_SCRIPT, createInitialState } from '../src/game/GameState';
import { hasLiveCommand } from '../src/ui/Onboarding';
import { mine, move } from '../src/engine/commands';
import { tileAt } from '../src/game/grid';
import { expectOk, robotOf, runTick } from './helpers';

/**
 * Only the script check is tested here. The card itself is DOM, but the thing
 * that can break the tutorial silently is this predicate: if it ever says yes to
 * the starter script, step two completes before the player has typed anything.
 */
describe('recognising a live command', () => {
  it('says no to the starter script, which is entirely commented out', () => {
    expect(hasLiveCommand(STARTER_SCRIPT)).toBe(false);
  });

  it('says yes once the starter loop is uncommented', () => {
    const uncommented = STARTER_SCRIPT.split('\n')
      .map((line) => line.replace(/^\/\/ ?/, ''))
      .join('\n');

    expect(hasLiveCommand(uncommented)).toBe(true);
  });

  it('says yes to a single bare command', () => {
    expect(hasLiveCommand("await move('south');")).toBe(true);
  });

  it('says no to an empty script', () => {
    expect(hasLiveCommand('')).toBe(false);
    expect(hasLiveCommand('\n\n   \n')).toBe(false);
  });

  it('says no to a command that is only mentioned in a comment', () => {
    expect(hasLiveCommand('// await mine();')).toBe(false);
    expect(hasLiveCommand('const x = 1; // await mine();')).toBe(false);
  });

  // Without await the line does not wait for the robot, and the tutorial is
  // asking for await specifically.
  it('says no to a call with no await in front of it', () => {
    expect(hasLiveCommand("move('south');")).toBe(false);
  });

  it('sees a command anywhere in a longer script', () => {
    const script = ['// a note', 'while (true) {', "  await move('south');", '}'].join('\n');
    expect(hasLiveCommand(script)).toBe(true);
  });
});

/**
 * The starting position is not the middle of the floor, and the comment on
 * `startPosition` explains why. This is the half of that promise a comment cannot
 * keep: the tutorial hands the player a script that walks south and mines, so
 * there has to be ore south of where they start. Move the robot or move that ore
 * and a brand new player's very first script walks into a wall.
 */
describe('the starting floor answers the starter script', () => {
  it('has ore somewhere south of the robot, within reach', () => {
    const state = createInitialState();
    const start = robotOf(state);
    const steps = state.grid.height - 1 - start.y;

    let mined = false;
    for (let i = 0; i < steps && !mined; i += 1) {
      expectOk(runTick(state, (ctx) => move(ctx, 'south')));

      const robot = robotOf(state);
      if (tileAt(state.grid, robot.x, robot.y)?.kind !== 'ore') continue;
      expectOk(runTick(state, mine));
      mined = true;
    }

    expect(mined, 'walking south from the start reaches no ore').toBe(true);
  });
});
