'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { startOfReorderWeek } from '@/lib/reorder';
import { optionalUuid, quantity, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  products,
  productVariants,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
} from '../db/schema';
import { getReorderRecommendations } from '../queries/reorder';
import { logActivity, nextDocumentNumber } from '../services/posting';
import { rateForRecord } from '../services/rates';
import { persistReorderSnapshot, recordReorderFailure } from '../services/reorder';
import { ActionError, writeAction } from './client';

const refreshSchema = z.object({
  runDate: z.string().datetime().optional(),
  /** Manual refreshes replace the current week's review queue by default. */
  force: z.boolean().default(true),
});

const createPoSchema = z.object({
  allowDuplicateOpenLines: z.boolean().default(false),
  items: z
    .array(
      z.object({
        variantId: uuid,
        supplierId: optionalUuid,
        quantity,
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
});

export const refreshReorderRecommendations = writeAction
  .metadata({ action: 'refreshed', entity: 'reorder recommendations' })
  .inputSchema(refreshSchema)
  .action(async ({ parsedInput, ctx }) => {
    const runDate = startOfReorderWeek(
      parsedInput.runDate ? new Date(parsedInput.runDate) : new Date(),
    );
    const recommendations = await getReorderRecommendations();

    try {
      return await db.transaction((tx) =>
        persistReorderSnapshot(tx, {
          runDate,
          recommendations,
          mode: parsedInput.force ? 'replace' : 'idempotent',
          memberId: ctx.member.id,
        }),
      );
    } catch (error) {
      // A failed transaction is aborted by Postgres, so the failure marker is
      // written from a fresh transaction rather than attempting another query
      // on the poisoned one.
      try {
        await db.transaction((tx) =>
          recordReorderFailure(
            tx,
            runDate,
            error instanceof Error ? error.message : String(error),
          ),
        );
      } catch {
        // Preserve the original action error; the runtime logger still has it.
      }
      throw error;
    }
  });

/**
 * Create one editable draft PO per supplier from reviewed recommendations.
 *
 * The client sends only the variant, quantity and optional supplier override.
 * Cost, source URL, product identity and weight are looked up again inside the
 * transaction so a stale browser cannot create a PO from tampered values.
 */
export const createDraftPurchaseOrders = writeAction
  .metadata({ action: 'created', entity: 'draft purchase orders' })
  .inputSchema(createPoSchema)
  .action(async ({ parsedInput, ctx }) => {
    const variantIds = parsedInput.items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new ActionError('Choose each product variant only once.');
    }

    return db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: productVariants.id,
          productName: products.name,
          variantName: productVariants.name,
          sku: productVariants.sku,
          sourceUrl: products.sourceUrl,
          productSupplierId: products.supplierId,
          productSupplierName: suppliers.name,
          productSupplierKind: suppliers.kind,
          referenceCostCents: productVariants.referenceCostCents,
          weightGrams: productVariants.weightGrams,
          isActive: productVariants.isActive,
          productStatus: products.status,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
        .where(inArray(productVariants.id, variantIds));

      if (
        rows.length !== variantIds.length ||
        rows.some((row) => !row.isActive || row.productStatus === 'archived')
      ) {
        throw new ActionError('Every recommendation must still be an active product variant.');
      }

      const supplierIds = [
        ...new Set(
          parsedInput.items
            .map((item) => item.supplierId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const productSupplierIds = rows
        .map((row) => row.productSupplierId)
        .filter((id): id is string => Boolean(id));
      const allSupplierIds = [...new Set([...supplierIds, ...productSupplierIds])];
      const supplierRows =
        allSupplierIds.length > 0
          ? await tx
              .select({ id: suppliers.id, name: suppliers.name })
              .from(suppliers)
              .where(inArray(suppliers.id, allSupplierIds))
          : [];
      const supplierNames = new Map(supplierRows.map((row) => [row.id, row.name]));
      const rowsById = new Map(rows.map((row) => [row.id, row]));

      for (const item of parsedInput.items) {
        const supplierId = item.supplierId ?? rowsById.get(item.variantId)?.productSupplierId;
        if (!supplierId || !supplierNames.has(supplierId)) {
          throw new ActionError(
            'Choose a supplier for every recommendation before creating a PO.',
          );
        }
      }

      if (!parsedInput.allowDuplicateOpenLines) {
        const openLines = await tx
          .select({ variantId: purchaseOrderItems.variantId, number: purchaseOrders.number })
          .from(purchaseOrderItems)
          .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId))
          .where(
            and(
              inArray(purchaseOrderItems.variantId, variantIds),
              inArray(purchaseOrders.status, ['draft', 'ordered', 'shipped']),
            ),
          );
        if (openLines.length > 0) {
          const labels = [...new Set(openLines.map((line) => line.number))].join(', ');
          throw new ActionError(
            `An open PO already contains one of these variants (${labels}). Enable the duplicate-line confirmation if this is intentional.`,
          );
        }
      }

      const costRows = await tx.execute<Record<string, string | null>>(sql`
        SELECT v.id::text AS id,
               COALESCE(
                 ROUND(s.value_cents::numeric / NULLIF(s.on_hand, 0)),
                 v.reference_cost_cents,
                 0
               )::text AS landed_unit_cost_cents
          FROM product_variants v
          LEFT JOIN v_stock_levels s ON s.variant_id = v.id
         WHERE v.id IN ${sql.join(
           variantIds.map((id) => sql`${id}::uuid`),
           sql`, `,
         )}
      `);
      const costById = new Map(
        costRows.map((row) => [String(row.id), Number(row.landed_unit_cost_cents ?? 0)]),
      );
      const groups = new Map<string, typeof parsedInput.items>();
      for (const item of parsedInput.items) {
        const supplierId = item.supplierId ?? rowsById.get(item.variantId)?.productSupplierId;
        if (!supplierId) throw new ActionError('Choose a supplier for every recommendation.');
        groups.set(supplierId, [...(groups.get(supplierId) ?? []), item]);
      }

      const rateMicros = await rateForRecord(new Date(), tx);
      const weekLabel = startOfReorderWeek().toISOString().slice(0, 10);
      const created: { id: string; number: string; supplierId: string; itemCount: number }[] =
        [];

      for (const [supplierId, items] of groups) {
        const number = await nextDocumentNumber(tx, 'PO-');
        const notes = [
          `Created from weekly purchasing recommendations for week ${weekLabel}.`,
          'Review quantities, shipping and import costs before raising the order.',
          ...items.map((item) => {
            const row = rowsById.get(item.variantId);
            const cost = costById.get(item.variantId) ?? 0;
            const source = row?.sourceUrl ? ` · Source: ${row.sourceUrl}` : '';
            const reason = item.reason ? ` · ${item.reason}` : '';
            return `${row?.sku ?? item.variantId}: ${item.quantity} × $${(cost / 100).toFixed(2)}${reason}${source}`;
          }),
        ].join('\n');
        const [order] = await tx
          .insert(purchaseOrders)
          .values({
            number,
            supplierId,
            status: 'draft',
            currency: 'USD',
            fxRateMicros: rateMicros,
            reference: `Recommendation ${weekLabel}`,
            notes,
            createdById: ctx.member.id,
          })
          .returning({ id: purchaseOrders.id });
        if (!order) throw new ActionError('Could not create a draft purchase order.');

        await tx.insert(purchaseOrderItems).values(
          items.map((item, index) => {
            const row = rowsById.get(item.variantId);
            const unitCostCents = costById.get(item.variantId) ?? 0;
            if (!row) throw new ActionError('A recommendation no longer exists.');
            return {
              purchaseOrderId: order.id,
              variantId: item.variantId,
              weightGrams: row.weightGrams,
              quantity: item.quantity,
              quantityReceived: 0,
              subtotalCents: item.quantity * unitCostCents,
              overheadCents: 0,
              shippingOverheadCents: 0,
              landedCostCents: item.quantity * unitCostCents,
              position: index + 1,
            };
          }),
        );
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'created draft purchase order from recommendations',
          entityType: 'purchase_order',
          entityId: order.id,
          entityLabel: number,
        });
        created.push({ id: order.id, number, supplierId, itemCount: items.length });
      }

      return { created };
    });
  });
