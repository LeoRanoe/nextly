import { expect, test } from '@playwright/test';

/**
 * Closes the loop through the interface, matching the roadmap's own words:
 * sign in, create a product, receive an order, record a sale, and assert
 * stock, cost of goods and the ledger all moved. The arithmetic is already
 * unit-tested (tests/unit/costing.test.ts); this is the one place that
 * proves the UI actually calls it — in particular that landed-cost
 * allocation genuinely ran on receipt, which is the whole reason this
 * product exists (see docs/00-product/overview.md's PO-001 story).
 *
 * Runs against whatever database `E2E_BASE_URL` (or the local dev server)
 * is wired to — see docs/05-operations/environments.md. That is
 * deliberately the shared one, not a disposable copy: the ledger is
 * append-only and a sale is a numbered document, so tearing anything down
 * would mean deleting exactly the records the system exists to preserve.
 * Three things make that safe:
 *   - every identifier is unique per run (`E2E-${Date.now()}`), so a retry
 *     never collides with a previous run or with itself;
 *   - every assertion is scoped to what THIS run's own documents caused —
 *     the ledger check filters to the new PO's and sale's own numbers via
 *     the ledger's search box, rather than diffing a global running
 *     balance, which any concurrent activity on a shared database could
 *     also move;
 *   - nothing is deleted or voided afterwards. The residue of a run is one
 *     product, one purchase order and one confirmed sale, which is what
 *     real use produces anyway.
 */

test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  'e2e needs E2E_EMAIL / E2E_PASSWORD for a database this app is wired to — see docs/05-operations/environments.md',
);

/** "$1,234.5000" → 1234.5, "1,234" → 1234. Strips everything but digits,
 *  the decimal point and a leading minus. */
function parseNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) throw new Error(`Could not parse a number from "${text}"`);
  return value;
}

test('create a product, receive an order, sell it, and watch the books move', async ({
  page,
}) => {
  const run = Date.now();
  const sku = `E2E-${run}`;
  const productName = `E2E Test Camera ${run}`;

  // ── Create a product ─────────────────────────────────────────────────
  await page.goto('/products/new');
  // Not { exact: true }: Field renders a required label as "Name*"
  // (components/ui/field.tsx appends the asterisk to the label text itself).
  await page.getByLabel('Name').fill(productName);
  // Code and slug auto-derive from the name; leave them.
  await page.getByLabel('SKU', { exact: true }).fill(sku);
  await page.getByLabel('Sell (USD)', { exact: true }).fill('49.99');
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page).toHaveURL('/products');
  await expect(page.getByText(`${productName} created`)).toBeVisible();

  // ── Raise a purchase order for 10 units ──────────────────────────────
  const goodsSubtotal = 200; // 10 units, doesn't need to match list price
  const shipping = 20;
  const tax = 10;
  const overhead = shipping + tax;

  await page.goto('/purchase-orders/new');
  await page.getByRole('button', { name: 'Choose a product' }).click();
  await page.getByPlaceholder('Search by name or SKU').fill(sku);
  await page.getByText(sku, { exact: true }).click();
  await page.getByLabel('Qty', { exact: true }).fill('10');
  await page.getByLabel('Goods (USD)', { exact: true }).fill(String(goodsSubtotal));
  await page.getByLabel('Shipping', { exact: true }).fill(String(shipping));
  await page.getByLabel('Sales tax', { exact: true }).fill(String(tax));

  const raisedToast = page.getByText(/Purchase order .+ raised/);
  await page.getByRole('button', { name: 'Raise order' }).click();
  await expect(page).toHaveURL('/purchase-orders');
  await expect(raisedToast).toBeVisible();
  const poNumber = (await raisedToast.innerText()).replace('Purchase order ', '').split(' ')[0];
  if (!poNumber)
    throw new Error('Could not read the new purchase order number from its toast.');

  // ── Receive it ────────────────────────────────────────────────────────
  await page.getByRole('link', { name: poNumber }).first().click();
  await expect(page).toHaveURL(/\/purchase-orders\/.+/);
  await page.getByRole('button', { name: 'Receive' }).click();
  await page.getByRole('button', { name: 'Receive order' }).click();
  await expect(page.getByText(`${poNumber} received`)).toBeVisible();

  // The point of this whole test: landed cost per unit is (subtotal +
  // overhead) / quantity, not just the goods price. If allocateOverhead
  // (src/lib/costing.ts) did not run, this would read $20.00, not $22.00.
  const expectedUnitCost = (goodsSubtotal + overhead) / 10;
  await expect(page.getByText(`$${expectedUnitCost.toFixed(4)}`)).toBeVisible();

  // ── Confirm it landed in inventory ───────────────────────────────────
  await page.goto('/inventory');
  await page.getByPlaceholder('Search by product, variant or SKU').fill(sku);
  const stockRow = page.locator('tbody tr', { hasText: sku });
  await expect(stockRow).toBeVisible();
  const onHandAfterReceipt = parseNumber(await stockRow.locator('td').nth(6).innerText());
  expect(onHandAfterReceipt).toBe(10);

  // ── Sell 2 units ──────────────────────────────────────────────────────
  const unitPrice = 49.99;
  await page.goto('/sales/new');
  await page.getByRole('button', { name: 'Choose a product' }).click();
  await page.getByPlaceholder('Search by name or SKU').fill(sku);
  await page.getByText(sku, { exact: true }).click();
  await page.getByLabel('Qty', { exact: true }).fill('2');
  await page.getByLabel('Unit (USD)', { exact: true }).fill(String(unitPrice));

  const soldToast = page.getByText(/Sale .+ recorded/);
  await page.getByRole('button', { name: 'Record sale' }).click();
  await expect(page).toHaveURL('/sales');
  await expect(soldToast).toBeVisible();
  const saleNumber = (await soldToast.innerText()).replace('Sale ', '').split(' ')[0];
  if (!saleNumber) throw new Error('Could not read the new sale number from its toast.');

  // ── Confirm stock dropped by exactly 2 ───────────────────────────────
  await page.goto('/inventory');
  await page.getByPlaceholder('Search by product, variant or SKU').fill(sku);
  const stockRowAfterSale = page.locator('tbody tr', { hasText: sku });
  const onHandAfterSale = parseNumber(await stockRowAfterSale.locator('td').nth(6).innerText());
  expect(onHandAfterSale).toBe(8);

  // ── Confirm each document's own ledger entry, not a global balance ────
  // Filtered by the document's own number, via the ledger's search box —
  // this is the delta, scoped to exactly what these two documents caused,
  // rather than a before/after snapshot of a balance any concurrent activity
  // on a shared database could also move.
  const expectedCogs = expectedUnitCost * 2;
  const expectedRevenue = unitPrice * 2;
  const expectedPurchasePayment = goodsSubtotal + overhead;

  await page.goto('/ledger');
  await page.getByPlaceholder('Search by description or owner').fill(poNumber);
  const purchaseRow = page.locator('tbody tr', { hasText: poNumber });
  await expect(purchaseRow).toBeVisible();
  const purchaseAmount = parseNumber(await purchaseRow.locator('td').nth(5).innerText());
  expect(Math.abs(purchaseAmount)).toBeCloseTo(expectedPurchasePayment, 2);

  await page.getByPlaceholder('Search by description or owner').fill(saleNumber);
  const saleRow = page.locator('tbody tr', { hasText: saleNumber });
  await expect(saleRow).toBeVisible();
  const saleAmount = parseNumber(await saleRow.locator('td').nth(5).innerText());
  expect(saleAmount).toBeCloseTo(expectedRevenue, 2);

  // Cost of goods sold is visible on the sale's own detail page — the
  // second half of "landed cost, not list price, was consumed".
  await page.goto('/sales');
  await page.getByRole('link', { name: saleNumber }).first().click();
  await expect(page).toHaveURL(/\/sales\/.+/);
  await expect(page.getByText(`$${expectedCogs.toFixed(2)}`).first()).toBeVisible();
});
