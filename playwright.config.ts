import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests, for the seams the unit tests cannot reach: the save
 * migration as the player actually experiences it, and the run of a script
 * through CodeMirror, the worker sandbox and the tick loop.
 *
 * Chromium only. This suite exists to prove the game works, not to survey
 * browsers, and every extra engine is another set of WebGL quirks to babysit.
 */

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',

  // Vitest owns tests/**/*.test.ts; these are the only files Playwright claims.
  testMatch: '**/*.spec.ts',

  /*
   * One worker, on purpose. Every spec drives the same cold Vite dev server, and
   * the game runs its script in a Web Worker that must answer within a 2s
   * watchdog. Under parallel load the worker gets starved of CPU, misses that
   * watchdog, and a passing test reports a timeout it never earned. Serialising
   * trades a few seconds of wall time for results that mean what they say.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  /**
   * Generous, because the first page load against a cold Vite dev server has to
   * transform three.js and CodeMirror on demand — measured at ~28s here. Later
   * loads hit the cache and take a fraction of that, but the first one must not
   * fail the run.
   */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
