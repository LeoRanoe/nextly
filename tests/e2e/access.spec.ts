import { expect, test } from '@playwright/test';

const stagingReady =
  Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD) &&
  process.env.E2E_ISOLATED_STAGING === '1';

test.skip(
  !stagingReady,
  'route access tests require E2E_EMAIL, E2E_PASSWORD, and an isolated staging database (E2E_ISOLATED_STAGING=1)',
);

const publicRoutes = [
  '/',
  '/login',
  '/auth/error?reason=missing-code',
  '/no-access',
  '/design-system',
  '/robots.txt',
  '/sitemap.xml',
];

const privateRoutes = [
  '/dashboard',
  '/bundles',
  '/categories',
  '/customers',
  '/expenses',
  '/inventory',
  '/ledger',
  '/owners',
  '/products',
  '/products/new',
  '/purchase-orders',
  '/purchase-orders/new',
  '/quotes',
  '/reorder',
  '/reports',
  '/sales',
  '/sales/new',
  '/settings',
  '/suppliers',
];

const detailRoutes = [
  { key: 'E2E_PRODUCT_ID', prefix: '/products/' },
  { key: 'E2E_CUSTOMER_ID', prefix: '/customers/' },
  { key: 'E2E_SALE_ID', prefix: '/sales/' },
  { key: 'E2E_PURCHASE_ORDER_ID', prefix: '/purchase-orders/' },
  { key: 'E2E_SUPPLIER_ID', prefix: '/suppliers/' },
  { key: 'E2E_INVOICE_ID', prefix: '/invoice/' },
].flatMap(({ key, prefix }) => {
  const value = process.env[key];
  return value ? [`${prefix}${value}`] : [];
});

test('public pages do not require a session or render the error boundary', async ({ page }) => {
  await page.context().clearCookies();

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByText('Nextly could not load this page')).toHaveCount(0);
  }
});

test('invalid public identifiers return intentional not-found responses', async ({
  request,
}) => {
  for (const route of [
    '/p/not-a-real-product',
    '/d/invoice/not-a-real-token',
    '/d/quote/not-a-real-token',
    '/d/invoice/x',
    '/d/quote/x',
  ]) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(404);
  }
});

test('owner can open every authenticated index and create route', async ({ page }) => {
  for (const route of [...privateRoutes, ...detailRoutes]) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByText('Nextly could not load this page')).toHaveCount(0);
  }
});

test('valid public product and document links render without login', async ({ request }) => {
  const fixtures = [
    process.env.E2E_PRODUCT_SLUG ? `/p/${process.env.E2E_PRODUCT_SLUG}` : null,
    process.env.E2E_INVOICE_TOKEN ? `/d/invoice/${process.env.E2E_INVOICE_TOKEN}` : null,
    process.env.E2E_QUOTE_TOKEN ? `/d/quote/${process.env.E2E_QUOTE_TOKEN}` : null,
  ].filter((route): route is string => Boolean(route));

  test.skip(fixtures.length === 0, 'set public E2E fixture values to test valid links');

  for (const route of fixtures) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(200);
  }
});

test('expired or revoked public document links return not found', async ({ request }) => {
  const fixtures = [
    process.env.E2E_EXPIRED_INVOICE_TOKEN
      ? `/d/invoice/${process.env.E2E_EXPIRED_INVOICE_TOKEN}`
      : null,
    process.env.E2E_EXPIRED_QUOTE_TOKEN
      ? `/d/quote/${process.env.E2E_EXPIRED_QUOTE_TOKEN}`
      : null,
  ].filter((route): route is string => Boolean(route));

  test.skip(
    fixtures.length === 0,
    'set expired or revoked public E2E fixture values to test revocation',
  );

  for (const route of fixtures) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(404);
  }
});

test('API auth keeps JSON responses instead of page redirects', async ({ request }) => {
  const response = await request.get('/api/export?entity=products', { maxRedirects: 0 });
  expect([401, 503]).toContain(response.status());
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers().location).toBeUndefined();
});

test('health endpoint reports a ready isolated staging runtime', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    status: 'ready',
    checks: { environment: true, database: true },
  });
});

test('viewer sessions remain readable but are refused by write UI', async ({ browser }) => {
  test.skip(
    !process.env.E2E_VIEWER_EMAIL || !process.env.E2E_VIEWER_PASSWORD,
    'set E2E_VIEWER_EMAIL and E2E_VIEWER_PASSWORD to verify viewer restrictions',
  );

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('/login');
    await page.locator('#email').fill(process.env.E2E_VIEWER_EMAIL ?? '');
    await page.locator('#password').fill(process.env.E2E_VIEWER_PASSWORD ?? '');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Read only')).toBeVisible();

    await page.goto('/products/new');
    await page.getByLabel('Name').fill(`Viewer access check ${Date.now()}`);
    await page.getByLabel('SKU', { exact: true }).fill(`VIEWER-${Date.now()}`);
    await page.getByLabel('Sell (USD)', { exact: true }).fill('1.00');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('read-only access')).toBeVisible();
  } finally {
    await context.close();
  }
});
