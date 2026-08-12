import { expect, test } from '@playwright/test';
import { SAVE_KEY, currentSave, version1Save } from './fixtures/saves';

/**
 * Phase 10a replaced the ore-node world with cultivated ground, which means
 * every save written before it describes a world that no longer exists. The
 * migration rebuilds the floor and keeps everything the player earned.
 *
 * Getting that wrong is the worst failure the game has: it looks like a fresh
 * start, says so in one line of console text nobody reads, and cannot be undone.
 * These tests watch that line and the cargo the migration converts credits into.
 */

const UPGRADED = 'Save loaded and upgraded from version 1.';
const UNREADABLE = 'Your save could not be read, so this is a fresh factory.';

/** Puts a save in place before any application code runs. */
async function seedSave(
  page: import('@playwright/test').Page,
  save: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript(
    ([key, raw]) => {
      window.localStorage.setItem(key as string, raw as string);
    },
    [SAVE_KEY, JSON.stringify(save)] as const,
  );
}

test('upgrades a pre-cultivation save without losing progress', async ({ page }) => {
  await seedSave(page, version1Save(12));
  await page.goto('/');
  await page.locator('body').press('e');

  await expect(page.locator('.console__line--system').filter({ hasText: UPGRADED })).toBeVisible();

  // The save is only migrated if what the player earned came through with it.
  // 777 credits convert to 259 iron ore at the old price of three, on top of the
  // 4 the robot was already carrying — so the cargo bar shows 263.
  await expect(page.locator('.hud__cargo')).toContainText('263');

  await expect(page.locator('.console__line').filter({ hasText: UNREADABLE })).toHaveCount(0);
});

test('says nothing about upgrading when the save is already current', async ({ page }) => {
  await seedSave(page, currentSave('// nothing to run'));
  await page.goto('/');
  await page.locator('body').press('e');

  await expect(page.locator('.console__line--system').filter({ hasText: 'Save loaded.' })).toBeVisible();
  await expect(page.locator('.console__line').filter({ hasText: 'upgraded' })).toHaveCount(0);
});

test('starts a fresh factory when the save is rubbish, and says so', async ({ page }) => {
  await page.addInitScript(
    ([key]) => {
      window.localStorage.setItem(key as string, '{"version":1,"grid":');
    },
    [SAVE_KEY] as const,
  );
  await page.goto('/');
  await page.locator('body').press('e');

  await expect(page.locator('.console__line--error').filter({ hasText: UNREADABLE })).toBeVisible();
});
