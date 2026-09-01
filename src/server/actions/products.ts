'use server';

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { consumeStock } from '@/lib/costing';
import { mulDivRound } from '@/lib/money';
import { productSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  inventoryMovements,
  products,
  productVariants,
  purchaseOrderItems,
  saleItems,
} from '../db/schema';
import { lockValuation, logActivity, postStockMovement } from '../services/posting';
import { ActionError, writeAction } from './client';

export const createProduct = writeAction
  .metadata({ action: 'created', entity: 'product' })
  .inputSchema(productSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          code: input.code.toUpperCase(),
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          supplierId: input.supplierId,
          sourceUrl: input.sourceUrl ?? null,
          summary: input.summary ?? null,
          description: input.description ?? null,
          status: input.status,
          catalogPublished: input.catalogPublished,
          catalogPublishedAt: input.catalogPublished ? new Date() : null,
          notes: input.notes ?? null,
        })
        .returning();

      if (!product) throw new ActionError('Could not create the product.');

      await tx.insert(productVariants).values(
        input.variants.map((variant, index) => ({
          productId: product.id,
          sku: variant.sku.toUpperCase(),
          name: variant.name,
          listPriceCents: variant.listPriceCents,
          referenceCostCents: variant.referenceCostCents,
          isDefault: index === 0,
          isActive: variant.isActive,
          position: index + 1,
        })),
      );

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created product',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.name,
      });

      return { id: product.id, name: product.name };
    });
    return result;
  });

/**
 * Update a product and reconcile its variants.
 *
 * A variant that has been dropped from the form is **deactivated, not
 * deleted**, whenever it has ever moved stock. Deleting it would orphan
 * historical sale lines and inventory movements, which is how a system quietly
 * loses the ability to explain last quarter.
 */
export const updateProduct = writeAction
  .metadata({ action: 'updated', entity: 'product' })
  .inputSchema(productSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That product no longer exists.');

      await tx
        .update(products)
        .set({
          code: input.code.toUpperCase(),
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          supplierId: input.supplierId,
          sourceUrl: input.sourceUrl ?? null,
          summary: input.summary ?? null,
          description: input.description ?? null,
          status: input.status,
          catalogPublished: input.catalogPublished,
          catalogPublishedAt: input.catalogPublished
            ? (existing.catalogPublishedAt ?? new Date())
            : null,
          notes: input.notes ?? null,
        })
        .where(eq(products.id, input.id));

      const keptIds: string[] = [];

      for (const [index, variant] of input.variants.entries()) {
        if (variant.id) {
          await tx
            .update(productVariants)
            .set({
              sku: variant.sku.toUpperCase(),
              name: variant.name,
              listPriceCents: variant.listPriceCents,
              referenceCostCents: variant.referenceCostCents,
              isActive: variant.isActive,
              isDefault: index === 0,
              position: index + 1,
            })
            .where(eq(productVariants.id, variant.id));
          keptIds.push(variant.id);
        } else {
          const [created] = await tx
            .insert(productVariants)
            .values({
              productId: input.id,
              sku: variant.sku.toUpperCase(),
              name: variant.name,
              listPriceCents: variant.listPriceCents,
              referenceCostCents: variant.referenceCostCents,
              isActive: variant.isActive,
              isDefault: index === 0,
              position: index + 1,
            })
            .returning({ id: productVariants.id });
          if (created) keptIds.push(created.id);
        }
      }

      const dropped = await tx
        .select({ id: productVariants.id, sku: productVariants.sku })
        .from(productVariants)
        .where(
          keptIds.length > 0
            ? and(
                eq(productVariants.productId, input.id),
                notInArray(productVariants.id, keptIds),
              )
            : eq(productVariants.productId, input.id),
        );

      for (const variant of dropped) {
        const [used] = await tx.execute<{ used: string }>(sql`
          SELECT (
            EXISTS (SELECT 1 FROM inventory_movements WHERE variant_id = ${variant.id})
            OR EXISTS (SELECT 1 FROM sale_items WHERE variant_id = ${variant.id})
            OR EXISTS (SELECT 1 FROM purchase_order_items WHERE variant_id = ${variant.id})
          )::text AS used
        `);

        if (used?.used === 'true') {
          await tx
            .update(productVariants)
            .set({ isActive: false })
            .where(eq(productVariants.id, variant.id));
        } else {
          await tx.delete(productVariants).where(eq(productVariants.id, variant.id));
        }
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated product',
        entityType: 'product',
        entityId: input.id,
        entityLabel: input.name,
      });

      return { id: input.id, name: input.name, deactivated: dropped.length };
    });
    return result;
  });

export const setProductStatus = writeAction
  .metadata({ action: 'updated', entity: 'product' })
  .inputSchema(
    z.object({
      id: uuid,
      status: z.enum(['draft', 'active', 'archived']).optional(),
      catalogPublished: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const name = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) throw new ActionError('That product no longer exists.');

      await tx
        .update(products)
        .set({
          ...(input.status ? { status: input.status } : {}),
          ...(input.catalogPublished === undefined
            ? {}
            : {
                catalogPublished: input.catalogPublished,
                catalogPublishedAt: input.catalogPublished
                  ? (product.catalogPublishedAt ?? new Date())
                  : null,
              }),
        })
        .where(eq(products.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action:
          input.catalogPublished === undefined
            ? `marked product ${input.status}`
            : input.catalogPublished
              ? 'published product to catalog'
              : 'unpublished product',
        entityType: 'product',
        entityId: product.id,
        entityLabel: product.name,
      });

      return product.name;
    });
    return { name };
  });

/**
 * Manual stock correction.
 *
 * Deliberately an *adjustment movement*, not an edit to a stock level: there is
 * no stock level to edit. The reason is required, because an unexplained
 * adjustment is the one thing that makes an inventory ledger as untrustworthy
 * as the spreadsheet it replaced.
 */
export const adjustStock = writeAction
  .metadata({ action: 'adjusted', entity: 'stock' })
  .inputSchema(
    z.object({
      variantId: uuid,
      quantity: z.coerce
        .number()
        .int()
        .refine((value) => value !== 0, {
          message: 'Enter a positive or negative number of units',
        }),
      reason: z.string().trim().min(3, 'Say what happened').max(500),
      kind: z.enum(['adjustment', 'write_off', 'return']),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, input.variantId))
        .limit(1);

      if (!variant) throw new ActionError('That variant no longer exists.');

      // `lockValuation`, not a bare SUM: an adjustment read without FOR UPDATE
      // races a concurrent sale reading the same average, and both write a cost
      // based on stock only one of them can have.
      const valuation = await lockValuation(tx, input.variantId);

      // Value the adjustment at the current weighted average, so a correction
      // does not silently change what the remaining stock is worth per unit.
      // Removals go through `consumeStock` — the same arithmetic a sale uses —
      // rather than multiplying a rounded unit cost, which drifts a cent per
      // adjustment and can drive the valuation negative when the write-off
      // exceeds what is on hand.
      const valueCents =
        input.quantity > 0
          ? valuation.quantity > 0
            ? mulDivRound(valuation.valueCents, input.quantity, valuation.quantity)
            : 0
          : -consumeStock(valuation, -input.quantity).cogsCents;

      await postStockMovement(tx, {
        variantId: input.variantId,
        kind: input.kind,
        quantity: input.quantity,
        valueCents,
        sourceKind: 'manual',
        sourceId: null,
        occurredAt: new Date(),
        note: input.reason,
        memberId: ctx.member.id,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `adjusted stock by ${input.quantity}`,
        entityType: 'variant',
        entityId: variant.id,
        entityLabel: variant.sku,
      });

      return { sku: variant.sku, onHand: valuation.quantity + input.quantity };
    });
    return result;
  });

/** Only for a product nothing has ever referenced. Anything with history is
 *  archived instead — see `setProductStatus`. */
export const deleteProduct = writeAction
  .metadata({ action: 'deleted', entity: 'product' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const name = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) throw new ActionError('That product no longer exists.');

      const variants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, input.id));

      const ids = variants.map((variant) => variant.id);
      if (ids.length > 0) {
        // `inArray` rather than interpolating the array into a template: the
        // sql`` tag would bind it as a single parameter, and `variant_id IN $1`
        // silently matches nothing.
        const [movement] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(inArray(inventoryMovements.variantId, ids))
          .limit(1);
        const [sold] = await tx
          .select({ id: saleItems.id })
          .from(saleItems)
          .where(inArray(saleItems.variantId, ids))
          .limit(1);
        const [ordered] = await tx
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.variantId, ids))
          .limit(1);

        if (movement || sold || ordered) {
          throw new ActionError(
            'This product has stock or trading history. Archive it instead of deleting it.',
          );
        }
      }

      await tx.delete(products).where(eq(products.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'deleted product',
        entityType: 'product',
        entityLabel: product.name,
      });

      return product.name;
    });
    return { name };
  });
