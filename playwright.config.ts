import { defineConfig, devices } from '@playwright/test';

/**
 * Closes the loop through the interface: this is what `pnpm e2e` runs,
 * making the script already declared in package.json true. See
 * tests/e2e/smoke.spec.ts for what it actually asserts.
 *
 * Needs a live isolated staging database — `E2E_BASE_URL` (or the default dev
 * server) must point at an app wired to one, and the suite requires
 * E2E_ISOLATED_STAGING=1 before it will run mutations.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The spec mutates staging books — parallel workers would race for stock on
  // the same variant and fight over the transactional gapless document
  // counter (private.next_document_number). One worker keeps it simple and
  // correct rather than fast.
  fullyParallel: false,
  workers: 1,
  // A retry re-runs the staging mutations. Safe here because the spec is written to
  // be idempotent per run (a fresh SKU each time) and asserts deltas, never
  // global totals — see smoke.spec.ts.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
  // Only starts a server when nothing already answers at baseURL — CI and a
  // local run against .claude/launch.json's already-running dev server both
  // work without change.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
