'use server';

import { asc, eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import { allocateOverhead, totalOverhead } from '@/lib/costing';
import { purchaseOrderSchema, receivePurchaseOrderSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { purchaseOrderItems, purchaseOrders } from '../db/schema';
import { TAGS } from '../queries/cache';
import {
  clearDocumentPostings,
  logActivity,
  nextDocumentNumber,
  postLedgerEntry,
  postStockMovement,
} from '../services/posting';
import { rateForRecord } from '../services/rates';
import { ActionError, writeAction } from './client';

export const createPurchaseOrder = writeAction
  .metadata({ action: 'created', entity: 'purchase order' })
  .inputSchema(purchaseOrderSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const rateMicros = await rateForRecord(input.orderedAt, tx);
      const number = await nextDocumentNumber(tx, 'PO-');

      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          number,
          supplierId: input.supplierId,
          status: 'ordered',
          currency: 'USD',
          fxRateMicros: rateMicros,
          taxCents: input.taxCents,
          cardFeeCents: input.cardFeeCents,
          deliveryCents: input.deliveryCents,
          shippingCents: input.shippingCents,
          shippingTaxCents: input.shippingTaxCents,
          orderedAt: input.orderedAt,
          expectedAt: input.expectedAt ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning();

      if (!order) throw new ActionError('Could not create the purchase order.');

      await tx.insert(purchaseOrderItems).values(
        input.items.map((item, index) => ({
          purchaseOrderId: order.id,
          variantId: item.variantId,
          quantity: item.quantity,
          quantityReceived: 0,
          subtotalCents: item.subtotalCents,
          // Overhead is allocated on receipt, not now: an order can still be
          // edited, and a cost basis written before the goods arrive is a cost
          // basis that will be wrong.
          overheadCents: 0,
          landedCostCents: item.subtotalCents,
          position: index + 1,
        })),
      );

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'raised purchase order',
        entityType: 'purchase_order',
        entityId: order.id,
        entityLabel: number,
      });

      return { id: order.id, number };
    });

    updateTag(TAGS.purchaseOrders);
    updateTag(TAGS.inventory);
    return result;
  });

/**
 * Receiving is where a purchase order becomes stock, and it is the single most
 * valuable thing this system does that the spreadsheet did not.
 *
 * Freight, tax, delivery and card fees are allocated across the lines pro-rata
 * by value, so each unit carries what it truly cost to land. On PO-001 that is
 * the difference between a reported 29.1% margin and a real 46.3% one.
 *
 * Everything below happens in one transaction: allocation, stock receipts, the
 * cash posting and the status change. Half of it would leave the books wrong in
 * a way nobody would notice for weeks.
 */
export const receivePurchaseOrder = writeAction
  .metadata({ action: 'received', entity: 'purchase order' })
  .inputSchema(receivePurchaseOrderSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);

      if (!order) throw new ActionError('That purchase order no longer exists.');
      if (order.status === 'received') {
        throw new ActionError('That order has already been received.');
      }
      if (order.status === 'cancelled') {
        throw new ActionError('A cancelled order cannot be received.');
      }

      const items = await tx
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, order.id))
        .orderBy(asc(purchaseOrderItems.position));

      if (items.length === 0) {
        throw new ActionError('Add at least one item before receiving this order.');
      }

      const overheadCents = totalOverhead({
        taxCents: order.taxCents,
        cardFeeCents: order.cardFeeCents,
        deliveryCents: order.deliveryCents,
        shippingCents: order.shippingCents,
        shippingTaxCents: order.shippingTaxCents,
      });

      const allocated = allocateOverhead(
        items.map((item) => ({
          id: item.id,
          subtotalCents: item.subtotalCents,
          quantity: item.quantity,
        })),
        overheadCents,
      );

      let landedTotalCents = 0;

      for (const line of allocated) {
        const item = items.find((candidate) => candidate.id === line.id);
        if (!item) continue;

        await tx
          .update(purchaseOrderItems)
          .set({
            overheadCents: line.overheadCents,
            landedCostCents: line.landedCostCents,
            quantityReceived: item.quantity,
          })
          .where(eq(purchaseOrderItems.id, item.id));

        await postStockMovement(tx, {
          variantId: item.variantId,
          kind: 'receipt',
          quantity: item.quantity,
          valueCents: line.landedCostCents,
          sourceKind: 'purchase_order',
          sourceId: order.id,
          occurredAt: input.receivedAt,
          note: `${order.number} received at landed cost.`,
          memberId: ctx.member.id,
        });

        landedTotalCents += line.landedCostCents;
      }

      await tx
        .update(purchaseOrders)
        .set({ status: 'received', receivedAt: input.receivedAt })
        .where(eq(purchaseOrders.id, order.id));

      if (input.postPayment) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'purchase',
          description: order.number,
          currency: order.currency,
          rateMicros: order.fxRateMicros,
          amountCents: landedTotalCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.receivedAt,
          memberId: ctx.member.id,
          sourceKind: 'purchase_order',
          sourceId: order.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'received purchase order',
        entityType: 'purchase_order',
        entityId: order.id,
        entityLabel: order.number,
      });

      return {
        number: order.number,
        landedTotalCents,
        overheadCents,
        unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
      };
    });

    updateTag(TAGS.purchaseOrders);
    updateTag(TAGS.inventory);
    updateTag(TAGS.ledger);
    updateTag(TAGS.products);

    return result;
  });

/** Move an order between `ordered` and `shipped`. */
export const setPurchaseOrderStatus = writeAction
  .metadata({ action: 'updated', entity: 'purchase order' })
  .inputSchema(z.object({ id: uuid, status: z.enum(['ordered', 'shipped']) }))
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);

      if (!order) throw new ActionError('That purchase order no longer exists.');
      if (order.status === 'received') {
        throw new ActionError('A received order cannot go back to an earlier status.');
      }

      await tx
        .update(purchaseOrders)
        .set({ status: input.status })
        .where(eq(purchaseOrders.id, order.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `marked purchase order ${input.status}`,
        entityType: 'purchase_order',
        entityId: order.id,
        entityLabel: order.number,
      });

      return order.number;
    });

    updateTag(TAGS.purchaseOrders);
    return { number };
  });

/**
 * Cancel an order, undoing its stock and cash postings if it had been received.
 * The document itself is kept, for the same reason a voided sale is.
 */
export const cancelPurchaseOrder = writeAction
  .metadata({ action: 'cancelled', entity: 'purchase order' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().max(500).optional() }))
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);

      if (!order) throw new ActionError('That purchase order no longer exists.');
      if (order.status === 'cancelled') throw new ActionError('Already cancelled.');

      await clearDocumentPostings(tx, 'purchase_order', order.id);

      await tx
        .update(purchaseOrderItems)
        .set({ quantityReceived: 0, overheadCents: 0 })
        .where(eq(purchaseOrderItems.purchaseOrderId, order.id));

      await tx
        .update(purchaseOrders)
        .set({
          status: 'cancelled',
          receivedAt: null,
          notes: input.reason
            ? `${order.notes ? `${order.notes}\n` : ''}Cancelled: ${input.reason}`
            : order.notes,
        })
        .where(eq(purchaseOrders.id, order.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'cancelled purchase order',
        entityType: 'purchase_order',
        entityId: order.id,
        entityLabel: order.number,
      });

      return order.number;
    });

    updateTag(TAGS.purchaseOrders);
    updateTag(TAGS.inventory);
    updateTag(TAGS.ledger);

    return { number };
  });
