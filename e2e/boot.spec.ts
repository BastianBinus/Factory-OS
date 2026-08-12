import { expect, test } from '@playwright/test';

/**
 * The smoke test, and the canary for WebGL in headless Chromium.
 *
 * `main.ts` replaces the whole of #app with a static "cannot start WebGL"
 * panel when the Scene constructor throws. If the browser running these tests
 * has no usable WebGL 2, every other spec would fail with a confusing symptom;
 * this one fails first and says exactly what is wrong.
 */

test('boots into a rendered factory', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(error.message));

  await page.goto('/');

  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.fallback')).toHaveCount(0);
  await expect(page.locator('.hud__credits')).toBeVisible();

  expect(crashes).toEqual([]);
});

test('opens the editor on E', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.codepanel')).toHaveAttribute('aria-hidden', 'true');

  await page.locator('body').press('e');

  await expect(page.locator('.codepanel')).toHaveClass(/codepanel--open/);
  await expect(page.locator('.codepanel')).toHaveAttribute('aria-hidden', 'false');
});
