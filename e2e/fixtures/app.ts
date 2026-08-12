import type { Page } from '@playwright/test';
import { SAVE_KEY } from './saves';

/** Puts a save in place before any application code runs. */
export async function seedSave(page: Page, save: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, raw]) => {
      window.localStorage.setItem(key as string, raw as string);
    },
    [SAVE_KEY, JSON.stringify(save)] as const,
  );
}

/**
 * Opens the script editor with the `E` shortcut — the way a player does.
 *
 * This deliberately exercises the shortcut rather than the toolbar button: the
 * handler in `main.ts` calls preventDefault() before focusing the editor, so the
 * `e` that opens the panel must not leak in as the first character of the
 * script. A run after this that finds a stray `e` means that guard regressed.
 */
export async function openEditor(page: Page): Promise<void> {
  await page.locator('body').press('e');
}
