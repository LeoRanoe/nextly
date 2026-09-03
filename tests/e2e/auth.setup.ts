import { expect, test as setup } from '@playwright/test';

/**
 * Signs in once and saves the session for every test in the `smoke` project
 * (see playwright.config.ts's `dependencies: ['setup']`), so the actual
 * spec does not re-authenticate on every run.
 *
 * Needs E2E_EMAIL / E2E_PASSWORD for an existing member — this does not
 * create an account, the same way the app itself never lets someone sign
 * themselves up (docs/01-architecture/security.md: an owner creates the
 * Supabase Auth account, and a members row is what grants access).
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  setup.skip(
    !email || !password || process.env.E2E_ISOLATED_STAGING !== '1',
    'authenticated e2e requires E2E_EMAIL, E2E_PASSWORD, and E2E_ISOLATED_STAGING=1',
  );
  if (!email || !password) return;

  await page.goto('/login');

  // The email field ships pre-filled with a placeholder admin address
  // (login-form.tsx), so clear it rather than typing straight into it.
  const emailField = page.locator('#email');
  await emailField.fill('');
  await emailField.fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/dashboard');
  await page.context().storageState({ path: 'tests/e2e/.auth/state.json' });
});
