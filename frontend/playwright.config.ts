import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Approved browser-level tests (P4.4).
 *
 * The tests drive the real React UI under Vite and mock the same-origin PHP API at the
 * network boundary. They need no MySQL server and no production deployment. When Chrome is
 * installed locally it is used directly; otherwise Playwright's managed Chromium must be
 * installed with `npx playwright install chromium`.
 */
const localCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((candidate): candidate is string => candidate !== undefined);
const executablePath = localCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
