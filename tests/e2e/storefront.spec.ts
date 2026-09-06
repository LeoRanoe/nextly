import { expect, test } from '@playwright/test';

/**
 * Public storefront fixtures are deliberately supplied by the isolated staging
 * environment. Product facts must remain real: this suite never seeds fake
 * reviews, stock or customer activity merely to make a browser assertion pass.
 */
const stagingReady =
  Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD) &&
  process.env.E2E_ISOLATED_STAGING === '1';
const productSlug = process.env.E2E_PUBLIC_PRODUCT_SLUG;
const productName = process.env.E2E_PUBLIC_PRODUCT_NAME;
const variantName = process.env.E2E_PUBLIC_VARIANT_NAME;

test.describe('storefront catalog', () => {
  test.skip(
    !stagingReady || !productSlug,
    'storefront e2e requires isolated staging credentials and E2E_PUBLIC_PRODUCT_SLUG',
  );

  test('shows a published product on the homepage and product page without private costs', async ({
    page,
  }) => {
    await page.goto('/');
    const productLink = page.locator(`a[href="/p/${productSlug}"]`).first();
    await expect(productLink).toBeVisible();

    await productLink.click();
    await expect(page).toHaveURL(new RegExp(`/p/${productSlug}$`));
    if (productName)
      await expect(page.getByRole('heading', { name: productName })).toBeVisible();
    if (variantName)
      await expect(page.getByRole('button', { name: variantName })).toBeVisible();

    const pageHtml = await page.content();
    for (const privateField of [
      'reference_cost',
      'landed_cost',
      'supplier_cost',
      'stock_valuation',
      'gross_margin',
    ]) {
      expect(pageHtml).not.toContain(privateField);
    }
  });

  test('keeps catalog filters in the URL and renders the WhatsApp product CTA', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Availability').selectOption('in-stock');
    await expect(page).toHaveURL(/availability=in-stock/);

    await page.goto(`/p/${productSlug}`);
    const whatsapp = page.getByRole('link', { name: /Order on WhatsApp|Ask about restock/ });
    await expect(whatsapp).toBeVisible();
    const href = await whatsapp.getAttribute('href');
    expect(href).toContain('wa.me');
    if (productName) expect(decodeURIComponent(href ?? '')).toContain(productName);
  });

  test('applies a storefront collection through the public catalog URL', async ({ page }) => {
    const collection = process.env.E2E_PUBLIC_COLLECTION_SLUG;
    test.skip(!collection, 'set E2E_PUBLIC_COLLECTION_SLUG to verify collection filtering');

    await page.goto(`/?collection=${collection}`);
    await expect(page).toHaveURL(new RegExp(`collection=${collection}`));
    await expect(page.locator(`a[href="/p/${productSlug}"]`).first()).toBeVisible();
  });
});

test.describe('storefront demand capture', () => {
  test.skip(
    !stagingReady ||
      !process.env.E2E_RESTOCK_PRODUCT_SLUG ||
      !process.env.E2E_RESTOCK_VARIANT_NAME,
    'restock e2e requires an isolated sold-out fixture product and variant',
  );

  test('records restock interest against the selected sold-out variant', async ({ page }) => {
    const slug = process.env.E2E_RESTOCK_PRODUCT_SLUG as string;
    const variant = process.env.E2E_RESTOCK_VARIANT_NAME as string;
    await page.goto(`/p/${slug}`);
    await page.getByRole('button', { name: variant }).click();
    await expect(page.getByText('This option is sold out')).toBeVisible();
    await page
      .getByLabel('WhatsApp number or email')
      .fill(`5978${Date.now().toString().slice(-6)}`);
    await page.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByText("We'll keep your request for the team.")).toBeVisible();
  });
});

test.describe('storefront product editor', () => {
  test.skip(
    !stagingReady || !process.env.E2E_DASHBOARD_PRODUCT_ID,
    'dashboard storefront e2e requires E2E_DASHBOARD_PRODUCT_ID on isolated staging',
  );

  test('saves product storefront compatibility fields', async ({ page }) => {
    const id = process.env.E2E_DASHBOARD_PRODUCT_ID as string;
    await page.goto(`/products/${id}`);
    const platforms = page.getByLabel('Platforms');
    await platforms.fill('Home Assistant');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/updated|saved/i)).toBeVisible();
  });
});
