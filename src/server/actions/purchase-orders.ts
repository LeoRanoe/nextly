'use server';

import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { allocateOverhead, totalOverhead } from '@/lib/costing';
import type { RateMicros } from '@/lib/fx';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney } from '@/lib/money';
import {
  purchaseOrderPaymentSchema,
  purchaseOrderSchema,
  receivePurchaseOrderSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import { purchaseOrderItems, purchaseOrderPayments, purchaseOrders } from '../db/schema';
import {
  clearDocumentPostings,
  logActivity,
  nextDocumentNumber,
  type PaymentMethod as PaymentMethodName,
  postLedgerEntry,
  postStockMovement,
  type Tx,
} from '../services/posting';
import { rateForRecord } from '../services/rates';
import { ActionError, writeAction } from './client';

/**
 * Record money paid to a supplier and post its own ledger entry (F-9).
 *
 * The buy-side mirror of `insertPayment` in sales.ts. The ledger entry is
 * tagged with the *payment's* id, not the order's: `clearDocumentPostings`
 * matches on source_id, so cancelling an order clears whatever it posted
 * directly while payments for money that actually left survive. The payment
 * row and its entry are created together, so derived `paid` can never
 * disagree with banked cash.
 */
async function insertPayment(
  tx: Tx,
  input: {
    orderId: string;
    number: string;
    amountCents: Cents;
    currency: CurrencyCode;
    rateMicros: RateMicros;
    method: PaymentMethodName;
    paidAt: Date;
    memberId: string;
    notes?: string | null;
  },
): Promise<{ id: string }> {
  if (input.amountCents <= 0) throw new ActionError('A payment must be more than zero.');

  const [payment] = await tx
    .insert(purchaseOrderPayments)
    .values({
      purchaseOrderId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency,
      fxRateMicros: input.rateMicros,
      method: input.method,
      paidAt: input.paidAt,
      notes: input.notes ?? null,
      memberId: input.memberId,
      createdById: input.memberId,
    })
    .returning();

  if (!payment) throw new ActionError('Could not record the payment.');

  await postLedgerEntry(tx, {
    direction: 'out',
    category: 'purchase',
    description: `${input.number} · payment`,
    currency: input.currency,
    rateMicros: input.rateMicros,
    amountCents: input.amountCents,
    paymentMethod: input.method,
    occurredAt: input.paidAt,
    memberId: input.memberId,
    sourceKind: 'purchase_order',
    sourceId: payment.id,
  });

  return { id: payment.id };
}

/** What has been paid on an order so far, in the currency of the order. */
async function paidOnOrder(tx: Tx, orderId: string): Promise<Cents> {
  const [row] = await tx.execute<{ paid: string }>(
    sql`SELECT COALESCE(SUM(amount_cents), 0)::text AS paid FROM purchase_order_payments WHERE purchase_order_id = ${orderId}`,
  );
  return Number(row?.paid ?? 0);
}

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
    return result;
  });

/**
 * Edit an order before it has been received.
 *
 * Refused for `received` or `cancelled`: a received order's landed cost is
 * the cost basis of stock that may already have been sold against it, and
 * rewriting the order would retroactively change those margins. Permitted
 * for `draft`, `ordered` and `shipped` — none of which have posted stock or
 * cash yet, so replacing the line items outright is safe.
 */
export const updatePurchaseOrder = writeAction
  .metadata({ action: 'updated', entity: 'purchase order' })
  .inputSchema(purchaseOrderSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);

      if (!order) throw new ActionError('That purchase order no longer exists.');

      if (order.status === 'received') {
        throw new ActionError(
          'This order has already been received. Its landed cost is the basis of stock that may already be sold — cancel it instead if it was wrong.',
        );
      }
      if (order.status === 'cancelled') {
        throw new ActionError('A cancelled order cannot be edited.');
      }

      await tx
        .update(purchaseOrders)
        .set({
          supplierId: input.supplierId,
          taxCents: input.taxCents,
          cardFeeCents: input.cardFeeCents,
          deliveryCents: input.deliveryCents,
          shippingCents: input.shippingCents,
          shippingTaxCents: input.shippingTaxCents,
          orderedAt: input.orderedAt,
          expectedAt: input.expectedAt ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        })
        .where(eq(purchaseOrders.id, input.id));

      await tx
        .delete(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, input.id));

      await tx.insert(purchaseOrderItems).values(
        input.items.map((item, index) => ({
          purchaseOrderId: input.id,
          variantId: item.variantId,
          quantity: item.quantity,
          quantityReceived: 0,
          subtotalCents: item.subtotalCents,
          overheadCents: 0,
          landedCostCents: item.subtotalCents,
          position: index + 1,
        })),
      );

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated purchase order',
        entityType: 'purchase_order',
        entityId: input.id,
        entityLabel: order.number,
      });

      return { id: input.id, number: order.number };
    });
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
        await insertPayment(tx, {
          orderId: order.id,
          number: order.number,
          amountCents: landedTotalCents,
          currency: order.currency,
          rateMicros: order.fxRateMicros,
          method: input.paymentMethod,
          paidAt: input.receivedAt,
          memberId: ctx.member.id,
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

    return result;
  });

/**
 * Record a payment to a supplier against an order (F-9).
 *
 * Receiving an order can pay it in full in one go; this covers every other
 * shape the money takes — a deposit when the order is placed, the balance on
 * delivery, paying one of two invoices. Each payment posts its own ledger
 * entry tagged with the payment's id, so "how much do we still owe?" has an
 * answer without anyone reconciling the ledger by eye.
 *
 * Overpaying is refused rather than rounded down, exactly as on the sell side:
 * an extra cent in the ledger that matches no invoice is the drift this system
 * exists to prevent.
 */
export const recordPurchaseOrderPayment = writeAction
  .metadata({ action: 'recorded', entity: 'purchase order payment' })
  .inputSchema(purchaseOrderPaymentSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.orderId))
        .limit(1);

      if (!order) throw new ActionError('That purchase order no longer exists.');
      if (order.status === 'cancelled') {
        throw new ActionError('A cancelled order cannot be paid — raise a new one instead.');
      }

      const [totals] = await tx.execute<{ landed: string }>(
        sql`SELECT COALESCE(SUM(landed_cost_cents), 0)::text AS landed FROM purchase_order_items WHERE purchase_order_id = ${order.id}`,
      );
      const landedCents = Number(totals?.landed ?? 0);
      if (landedCents <= 0) {
        throw new ActionError(
          'This order has no landed cost yet — receive it before paying the balance.',
        );
      }

      const alreadyPaid = await paidOnOrder(tx, order.id);
      const balance = landedCents - alreadyPaid;
      if (balance <= 0) throw new ActionError('That order is already paid in full.');
      if (input.amountCents > balance) {
        throw new ActionError(
          `That is more than the outstanding balance (${formatMoney(balance, order.currency)}).`,
        );
      }

      await insertPayment(tx, {
        orderId: order.id,
        number: order.number,
        amountCents: input.amountCents,
        currency: order.currency,
        rateMicros: order.fxRateMicros,
        method: input.paymentMethod,
        paidAt: input.paidAt ?? new Date(),
        memberId: ctx.member.id,
        notes: input.notes ?? null,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'paid supplier',
        entityType: 'purchase_order',
        entityId: order.id,
        entityLabel: order.number,
        diff: {
          paid_cents: { from: alreadyPaid, to: alreadyPaid + input.amountCents },
        },
      });

      return {
        number: order.number,
        amountCents: input.amountCents,
        landedCents,
        paidCents: alreadyPaid + input.amountCents,
        balanceCents: balance - input.amountCents,
      };
    });
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
    return { number };
  });

/**
 * Cancel an order, undoing its stock and cash postings if it had been received.
 * The document itself is kept, for the same reason a voided sale is.
 *
 * Payments recorded under F-9 deliberately survive cancellation: their ledger
 * entries are tagged with the payment's id, so `clearDocumentPostings` — which
 * matches on the order's id — leaves them in the cash history. Money that
 * actually left the bank does not un-leave because an order was cancelled;
 * getting it back is a refund, which is its own entry.
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

    return { number };
  });
