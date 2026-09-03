import { sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import type { Cents } from '@/lib/money';
import { db } from '../db/client';
import { bool, maybe, num, text } from './row';

/**
 * The `isDatabaseConfigured()` guard on each function below is a SETUP state,
 * not an outage. Only an ABSENT connection string returns empty; a failing
 * query still throws, because an empty dashboard must never be able to mean
 * "the database is down". See src/app/setup/page.tsx.
 */

/**
 * Option lists for form pickers.
 *
 * Each one carries the *decision-relevant* detail alongside the label, because
 * a picker that shows only names forces the person filling in the form to go
 * and look up the price or the stock level somewhere else. That round trip is
 * what makes people give up and reach for the spreadsheet instead.
 */

export type VariantOption = {
  id: string;
  sku: string;
  productName: string;
  variantName: string;
  listPriceCents: Cents;
  referenceCostCents: Cents;
  weightGrams: number;
  onHand: number;
  /** Total cost of the units on hand. Carried so the form can compute the
   *  cost of goods with exactly the arithmetic the server will use, rather
   *  than showing a margin that shifts by a cent on submit. */
  valueCents: Cents;
  /** Weighted-average cost per unit, in cents. Null when nothing is on hand. */
  unitCostCents: number | null;
  isActive: boolean;
};

export async function listVariantOptions(): Promise<VariantOption[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      v.id, v.sku, v.name AS variant_name, v.is_active::text AS is_active,
      v.list_price_cents::text, v.reference_cost_cents::text, v.weight_grams::text,
      p.name AS product_name,
      COALESCE(s.on_hand, 0)::text     AS on_hand,
      COALESCE(s.value_cents, 0)::text AS value_cents
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN v_stock_levels s ON s.variant_id = v.id
    WHERE p.status <> 'archived'
    ORDER BY p.name, v.position
  `);

  return rows.map((row) => {
    const onHand = num(row.on_hand);
    const valueCents = num(row.value_cents);
    return {
      id: text(row.id),
      sku: text(row.sku),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      listPriceCents: num(row.list_price_cents),
      referenceCostCents: num(row.reference_cost_cents),
      weightGrams: num(row.weight_grams),
      onHand,
      valueCents,
      unitCostCents: onHand > 0 ? valueCents / onHand : null,
      isActive: bool(row.is_active),
    };
  });
}

export type Option = { id: string; label: string; hint?: string | null };

export type BundleComponentOption = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  sku: string;
  listPriceCents: Cents;
  landedUnitCostCents: Cents;
  onHand: number;
  weightGrams: number;
};

export type BundleOption = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: Cents;
  availability: number;
  componentRetailCents: Cents;
  landedCostCents: Cents;
  components: BundleComponentOption[];
};

export async function listBundleOptions(): Promise<BundleOption[]> {
  if (!isDatabaseConfigured()) return [];
  const [headers, componentRows] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT id, sku, name, description, price_cents::text
      FROM bundles WHERE is_active = true ORDER BY name
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT bc.bundle_id, bc.variant_id, bc.quantity, bc.product_name, bc.variant_name,
        bc.sku, bc.weight_grams,
        v.list_price_cents::text,
        COALESCE(ROUND(s.value_cents::numeric / NULLIF(s.on_hand, 0)), v.reference_cost_cents, 0)::text AS landed_unit_cost_cents,
        COALESCE(s.on_hand, 0)::text AS on_hand
      FROM bundle_components bc
      JOIN product_variants v ON v.id = bc.variant_id
      LEFT JOIN v_stock_levels s ON s.variant_id = v.id
      ORDER BY bc.bundle_id, bc.position
    `),
  ]);
  const byBundle = new Map<string, BundleComponentOption[]>();
  for (const row of componentRows) {
    const component = {
      variantId: text(row.variant_id),
      quantity: num(row.quantity, 1),
      productName: text(row.product_name),
      variantName: text(row.variant_name),
      sku: text(row.sku),
      listPriceCents: num(row.list_price_cents),
      landedUnitCostCents: num(row.landed_unit_cost_cents),
      onHand: num(row.on_hand),
      weightGrams: num(row.weight_grams),
    };
    byBundle.set(text(row.bundle_id), [
      ...(byBundle.get(text(row.bundle_id)) ?? []),
      component,
    ]);
  }
  return headers.map((row) => {
    const components = byBundle.get(text(row.id)) ?? [];
    return {
      id: text(row.id),
      sku: text(row.sku),
      name: text(row.name),
      description: maybe(row.description),
      priceCents: num(row.price_cents),
      components,
      availability: components.length
        ? Math.min(
            ...components.map((component) => Math.floor(component.onHand / component.quantity)),
          )
        : 0,
      componentRetailCents: components.reduce(
        (sum, component) => sum + component.quantity * component.listPriceCents,
        0,
      ),
      landedCostCents: components.reduce(
        (sum, component) => sum + component.quantity * component.landedUnitCostCents,
        0,
      ),
    };
  });
}

export async function listCustomerOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, code, phone FROM customers ORDER BY name
  `);

  return rows.map((row) => ({
    id: text(row.id),
    label: text(row.name),
    hint: maybe(row.phone) ?? text(row.code),
  }));
}

export async function listCategoryOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name FROM categories ORDER BY position, name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.name) }));
}

export async function listSupplierOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name, kind::text AS kind FROM suppliers ORDER BY name
  `);
  return rows.map((row) => ({
    id: text(row.id),
    label: text(row.name),
    hint: maybe(row.kind),
  }));
}

export async function listExpenseCategoryOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, name FROM expense_categories ORDER BY position, name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.name) }));
}

/** Principals only: the people an owner contribution or draw can belong to. */
export async function listPrincipalOptions(): Promise<Option[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT id, full_name FROM members WHERE is_principal ORDER BY full_name
  `);
  return rows.map((row) => ({ id: text(row.id), label: text(row.full_name) }));
}

/** Orders that can still be received, for the receive dialog. */
export async function listOpenPurchaseOrders(): Promise<
  { id: string; number: string; supplierName: string | null; totalCents: Cents }[]
> {
  if (!isDatabaseConfigured()) return [];

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT
      p.id, p.number, s.name AS supplier_name,
      (COALESCE((SELECT SUM(i.subtotal_cents) FROM purchase_order_items i
                  WHERE i.purchase_order_id = p.id), 0)
       + p.tax_cents + p.card_fee_cents + p.delivery_cents
       + p.shipping_cents + p.shipping_tax_cents)::text AS total_cents
    FROM purchase_orders p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status IN ('draft', 'ordered', 'shipped')
    ORDER BY p.ordered_at DESC NULLS LAST, p.number DESC
  `);

  return rows.map((row) => ({
    id: text(row.id),
    number: text(row.number),
    supplierName: maybe(row.supplier_name),
    totalCents: num(row.total_cents),
  }));
}
