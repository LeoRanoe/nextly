'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { optimumBundlePrice } from '@/lib/reorder';
import { bundleSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { bundleComponents, bundles, products, productVariants } from '../db/schema';
import { getSettings } from '../queries/reference';
import { logActivity, type Tx } from '../services/posting';
import { ActionError, writeAction } from './client';

const bundlePriceSchema = z.object({
  components: z
    .array(z.object({ variantId: uuid, quantity: z.coerce.number().int().positive() }))
    .min(1),
  targetMargin: z.coerce.number().min(0).max(0.99).optional(),
  discount: z.coerce.number().min(0).max(0.99).optional(),
});

async function snapshotComponents(tx: Tx, input: { variantId: string; quantity: number }[]) {
  const ids = input.map((component) => component.variantId);
  if (new Set(ids).size !== ids.length)
    throw new ActionError('Each bundle component can only be added once.');
  const rows = await tx
    .select({
      variantId: productVariants.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      weightGrams: productVariants.weightGrams,
      active: productVariants.isActive,
      productStatus: products.status,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, ids));
  if (
    rows.length !== ids.length ||
    rows.some((row) => !row.active || row.productStatus === 'archived')
  ) {
    throw new ActionError('Every bundle component must be an active product variant.');
  }
  const byId = new Map(rows.map((row) => [row.variantId, row]));
  return input.map((component, position) => {
    const row = byId.get(component.variantId);
    if (!row) throw new ActionError('A bundle component no longer exists.');
    return {
      bundleId: '',
      variantId: row.variantId,
      quantity: component.quantity,
      productName: row.productName,
      variantName: row.variantName,
      sku: row.sku,
      weightGrams: row.weightGrams,
      position: position + 1,
    };
  });
}

export const createBundle = writeAction
  .metadata({ action: 'created', entity: 'bundle' })
  .inputSchema(bundleSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const components = await snapshotComponents(tx, input.components);
      const [bundle] = await tx
        .insert(bundles)
        .values({
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          createdById: ctx.member.id,
        })
        .returning({ id: bundles.id });
      if (!bundle) throw new ActionError('Could not create the bundle.');
      await tx
        .insert(bundleComponents)
        .values(components.map((component) => ({ ...component, bundleId: bundle.id })));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created bundle',
        entityType: 'bundle',
        entityId: bundle.id,
        entityLabel: input.sku,
      });
      return { id: bundle.id, sku: input.sku };
    });
  });

export const updateBundle = writeAction
  .metadata({ action: 'updated', entity: 'bundle' })
  .inputSchema(bundleSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: bundles.id, isActive: bundles.isActive })
        .from(bundles)
        .where(eq(bundles.id, input.id))
        .limit(1);
      if (!existing) throw new ActionError('That bundle no longer exists.');
      if (!existing.isActive) throw new ActionError('An archived bundle cannot be edited.');
      const components = await snapshotComponents(tx, input.components);
      await tx
        .update(bundles)
        .set({
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          updatedAt: new Date(),
        })
        .where(eq(bundles.id, input.id));
      await tx.delete(bundleComponents).where(eq(bundleComponents.bundleId, input.id));
      await tx
        .insert(bundleComponents)
        .values(components.map((component) => ({ ...component, bundleId: input.id })));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated bundle',
        entityType: 'bundle',
        entityId: input.id,
        entityLabel: input.sku,
      });
      return { id: input.id, sku: input.sku };
    });
  });

export const archiveBundle = writeAction
  .metadata({ action: 'archived', entity: 'bundle' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [bundle] = await tx
        .update(bundles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(bundles.id, input.id), eq(bundles.isActive, true)))
        .returning({ id: bundles.id, sku: bundles.sku });
      if (!bundle)
        throw new ActionError('That bundle is already archived or no longer exists.');
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'archived bundle',
        entityType: 'bundle',
        entityId: bundle.id,
        entityLabel: bundle.sku,
      });
      return bundle;
    });
  });

export const recalculateBundlePrice = writeAction
  .metadata({ action: 'recalculated', entity: 'bundle price' })
  .inputSchema(bundlePriceSchema)
  .action(async ({ parsedInput: input }) => {
    const settings = await getSettings();
    const targetMargin =
      input.targetMargin ?? (settings?.targetBundleMarginBp ?? 3000) / 10_000;
    const discount = input.discount ?? (settings?.defaultBundleDiscountBp ?? 500) / 10_000;
    const rows = await db.execute<Record<string, string | null>>(sql`
      SELECT x.variant_id, x.quantity, v.list_price_cents::text,
        COALESCE(ROUND(s.value_cents::numeric / NULLIF(s.on_hand, 0)), v.reference_cost_cents, 0)::text AS landed_unit_cost_cents
      FROM jsonb_to_recordset(${JSON.stringify(input.components)}::jsonb) AS x(variant_id uuid, quantity integer)
      JOIN product_variants v ON v.id = x.variant_id
      LEFT JOIN v_stock_levels s ON s.variant_id = v.id
    `);
    if (rows.length !== input.components.length)
      throw new ActionError('One or more bundle components no longer exists.');
    const landedCostCents = rows.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0) * Number(row.landed_unit_cost_cents ?? 0),
      0,
    );
    const componentRetailCents = rows.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0) * Number(row.list_price_cents ?? 0),
      0,
    );
    return {
      ...optimumBundlePrice(landedCostCents, componentRetailCents, targetMargin, discount),
      landedCostCents,
      componentRetailCents,
      targetMargin,
      discount,
    };
  });
