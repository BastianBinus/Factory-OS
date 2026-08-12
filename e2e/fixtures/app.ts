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
 * Opens the script editor through the toolbar button rather than the `E`
 * shortcut.
 *
 * The shortcut opens the panel and then types the `e` into the document it just
 * focused — `main.ts` does not call preventDefault() on that branch, and
 * `CodePanel.setOpen` focuses the editor synchronously. Until that is fixed,
 * every test that used the shortcut would be running a corrupted script.
 */
export async function openEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Code' }).click();
}
