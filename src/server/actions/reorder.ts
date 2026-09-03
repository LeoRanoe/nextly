'use server';

import { z } from 'zod';
import { quantity, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { reorderRecommendations, reorderRuns } from '../db/schema/planning';
import { purchaseOrderItems, purchaseOrders } from '../db/schema/procurement';
import { getReorderRecommendations } from '../queries/reorder';
import { logActivity, nextDocumentNumber } from '../services/posting';
import { ActionError, writeAction } from './client';

const refreshSchema = z.object({ runDate: z.string().datetime().optional() });
const createPoSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: uuid,
        supplierId: uuid,
        quantity: quantity,
        unitCostCents: z.coerce.number().int().nonnegative(),
      }),
    )
    .min(1),
});
const mondayStart = (date: Date) => {
  const value = new Date(date);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - ((day + 6) % 7));
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

export const refreshReorderRecommendations = writeAction
  .metadata({ action: 'refreshed', entity: 'reorder recommendations' })
  .inputSchema(refreshSchema)
  .action(async ({ parsedInput, ctx }) => {
    const runDate = mondayStart(
      parsedInput.runDate ? new Date(parsedInput.runDate) : new Date(),
    );
    const recommendations = await getReorderRecommendations();
    const result = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(reorderRuns)
        .values({ runDate, status: 'completed' })
        .onConflictDoNothing({ target: reorderRuns.runDate })
        .returning();
      if (!run)
        throw new ActionError('A recommendation snapshot already exists for this run date.');
      if (recommendations.length > 0) {
        await tx.insert(reorderRecommendations).values(
          recommendations.map((row) => ({
            runId: run.id,
            variantId: row.variantId,
            supplierId: row.supplierId,
            unitsSold90d: row.unitsSold90d,
            grossProfitCents90d: row.grossProfitCents90d,
            revenueCents90d: row.revenueCents90d,
            onHand: row.onHand,
            inbound: row.inbound,
            landedUnitCostCents: row.landedUnitCostCents,
            dailyDemand: String(row.dailyDemand),
            daysOfCover: row.daysOfCover === null ? null : String(row.daysOfCover),
            recommendedQty: row.recommendedQty,
            budgetQty: row.budgetQty,
            deferredQty: row.deferredQty,
            score: String(row.score),
            reasons: row.reasons,
            lowConfidence: !row.hasEnoughHistory,
          })),
        );
      }
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'refreshed reorder recommendations',
        entityType: 'reorder_run',
        entityId: run.id,
        entityLabel: runDate.toISOString().slice(0, 10),
      });
      return { id: run.id };
    });
    return result;
  });

export const createDraftPurchaseOrders = writeAction
  .metadata({ action: 'created', entity: 'draft purchase orders' })
  .inputSchema(createPoSchema)
  .action(async ({ parsedInput, ctx }) => {
    const groups = new Map<string, typeof parsedInput.items>();
    for (const item of parsedInput.items)
      groups.set(item.supplierId, [...(groups.get(item.supplierId) ?? []), item]);
    return db.transaction(async (tx) => {
      const created: { id: string; number: string }[] = [];
      for (const [supplierId, items] of groups) {
        const number = await nextDocumentNumber(tx, 'PO-');
        const [order] = await tx
          .insert(purchaseOrders)
          .values({
            number,
            supplierId,
            status: 'draft',
            currency: 'USD',
            notes:
              'Created from weekly purchasing recommendations. Review quantities, shipping and import costs before raising.',
            createdById: ctx.member.id,
          })
          .returning({ id: purchaseOrders.id });
        if (!order) throw new ActionError('Could not create a draft purchase order.');
        await tx.insert(purchaseOrderItems).values(
          items.map((item, index) => ({
            purchaseOrderId: order.id,
            variantId: item.variantId,
            quantity: item.quantity,
            quantityReceived: 0,
            subtotalCents: item.quantity * item.unitCostCents,
            overheadCents: 0,
            landedCostCents: item.quantity * item.unitCostCents,
            position: index + 1,
          })),
        );
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'created draft purchase order',
          entityType: 'purchase_order',
          entityId: order.id,
          entityLabel: number,
        });
        created.push({ id: order.id, number });
      }
      return { created };
    });
  });
