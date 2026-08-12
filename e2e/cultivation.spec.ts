import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { openEditor, seedSave } from './fixtures/app';
import { currentSave } from './fixtures/saves';

/**
 * The seam no unit test can reach: CodeMirror hands a script to an
 * AsyncFunction in a Web Worker, the worker asks the tick loop for one command
 * per tick, and the world ripens crops between them. Every part of that is
 * covered on its own; that they add up to a playable game has until now only
 * ever been confirmed by a human clicking Run.
 *
 * The script arrives through the save rather than by typing into CodeMirror.
 * Driving a CodeMirror document with synthetic keystrokes is by far the most
 * fragile way to get text into this app, and it is not what is under test.
 */

async function runScript(page: Page, script: string): Promise<void> {
  await seedSave(page, currentSave(script));
  await page.goto('/');
  await openEditor(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

/** The console line a `print(...)` produced, matched by its leading marker. */
function printed(page: Page, marker: string) {
  return page.locator('.console__line--print').filter({ hasText: new RegExp(`^${marker} `) });
}

test('walks raw ground through to a growing crop', async ({ page }) => {
  await runScript(
    page,
    [
      "print('A', (await scan()).state);",
      'await clear();',
      "print('B', (await scan()).state);",
      "await seed('iron_ore');",
      "print('C', (await scan()).state);",
    ].join('\n'),
  );

  await expect(printed(page, 'A')).toHaveText('A raw');
  await expect(printed(page, 'B')).toHaveText('B prepared');

  /*
   * The state is asserted, the countdown deliberately is not. The world ripens
   * on its own clock while the script runs, so the exact `ripeIn` a scan reads
   * depends on how many wall-clock ticks happened to elapse first — it came back
   * 3, 5 and 6 across runs. That a freshly seeded tile is `growing` is the
   * invariant; the number is weather.
   */
  await expect(printed(page, 'C')).toHaveText('C growing');
});

test('ripens a crop on the world clock and harvests it back to raw', async ({ page }) => {
  await runScript(
    page,
    [
      'await clear();',
      "await seed('iron_ore');",
      'let t = await scan();',
      // Bounded so a broken ripen() fails the assertion instead of hanging.
      'for (let i = 0; i < 40 && t.state !== "ripe"; i += 1) { t = await scan(); }',
      "print('D', t.state, t.yield);",
      'await mine();',
      "print('E', (await scan()).state);",
    ].join('\n'),
  );

  // Yield is the base 3: this floor is bare, so there is no adjacency bonus.
  await expect(printed(page, 'D')).toHaveText('D ripe 3');
  await expect(printed(page, 'E')).toHaveText('E raw');
});

test('refuses a command that is not unlocked, and says which', async ({ page }) => {
  await runScript(page, 'await craft();');

  // Not a ReferenceError: a locked command is present and answers for itself,
  // so the player is told what is wrong rather than that a name does not exist.
  await expect(page.locator('.console__line--error').first()).toContainText(
    'craft() is not unlocked yet.',
  );
});
