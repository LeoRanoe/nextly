'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { returnedPortion } from '@/lib/costing';
import { normaliseToUsd } from '@/lib/fx';
import { quantity, saleSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { saleItems, sales } from '../db/schema';
import {
  clearDocumentPostings,
  consumeStockFor,
  logActivity,
  nextDocumentNumber,
  postLedgerEntry,
  postStockMovement,
} from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { ActionError, writeAction } from './client';

/**
 * Recording a sale is the highest-frequency action in the system, and the one
 * with the most consequences: it moves stock, fixes the cost of goods at the
 * weighted average in force *at that moment*, computes margin, and posts cash.
 *
 * All of it happens in one transaction. A sale that moved stock but never
 * posted its receipt would be worse than one that failed outright, because
 * nobody would notice until the books stopped balancing.
 */
export const createSale = writeAction
  .metadata({ action: 'created', entity: 'sale' })
  .inputSchema(saleSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.soldAt, tx)
          : await rateForRecord(input.soldAt, tx);

      const number = await nextDocumentNumber(tx, 'V');

      const [sale] = await tx
        .insert(sales)
        .values({
          number,
          customerId: input.customerId,
          status: input.confirm ? 'confirmed' : 'draft',
          currency: input.currency,
          fxRateMicros: rateMicros,
          paymentMethod: input.paymentMethod,
          soldAt: input.soldAt,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning();

      if (!sale) throw new ActionError('Could not create the sale.');

      let totalCents = 0;
      let totalUsdCents = 0;
      let cogsCents = 0;
      let shortfallTotal = 0;

      for (const [index, item] of input.items.entries()) {
        // Normalise the line total, not the unit price. Converting per unit and
        // then multiplying compounds the rounding error by the quantity.
        const lineTotalCents = item.unitPriceCents * item.quantity;
        const lineTotalUsdCents = normaliseToUsd(lineTotalCents, input.currency, rateMicros);
        const unitPriceUsdCents = normaliseToUsd(
          item.unitPriceCents,
          input.currency,
          rateMicros,
        );

        let lineCogs = 0;
        let shortfall = 0;

        if (input.confirm) {
          const consumed = await consumeStockFor(tx, {
            variantId: item.variantId,
            quantity: item.quantity,
            sourceKind: 'sale',
            sourceId: sale.id,
            occurredAt: input.soldAt,
            memberId: ctx.member.id,
            note: `${number} at weighted-average landed cost.`,
          });
          lineCogs = consumed.cogsCents;
          shortfall = consumed.shortfall;
        }

        await tx.insert(saleItems).values({
          saleId: sale.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          unitPriceUsdCents,
          lineTotalUsdCents,
          cogsCents: lineCogs,
          shortfall,
          position: index + 1,
        });

        totalCents += lineTotalCents;
        totalUsdCents += lineTotalUsdCents;
        cogsCents += lineCogs;
        shortfallTotal += shortfall;
      }

      await tx
        .update(sales)
        .set({
          totalCents,
          totalUsdCents,
          cogsCents,
          grossProfitCents: totalUsdCents - cogsCents,
        })
        .where(eq(sales.id, sale.id));

      // A draft has not happened yet, so it moves no cash.
      if (input.confirm) {
        await postLedgerEntry(tx, {
          direction: 'in',
          category: 'sales_receipt',
          description: `${number}${input.customerId ? '' : ' (walk-in)'}`,
          currency: input.currency,
          rateMicros,
          amountCents: totalCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.soldAt,
          memberId: ctx.member.id,
          sourceKind: 'sale',
          sourceId: sale.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.confirm ? 'confirmed sale' : 'drafted sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: number,
      });

      return { id: sale.id, number, totalUsdCents, cogsCents, shortfallTotal };
    });

    return result;
  });

/**
 * Edit a draft.
 *
 * Refused for anything else: a confirmed sale has already moved stock and
 * cash at a specific cost and rate, and rewriting its lines would rewrite a
 * margin someone has already relied on. The correction for a confirmed sale
 * is `voidSale`, the same principle `reverseLedgerEntry` uses — a mistake
 * gets undone, not erased.
 *
 * Otherwise this runs exactly `createSale`'s logic — recompute totals, and if
 * `confirm` is set, consume stock and post the receipt — starting from the
 * existing row's id instead of creating a new one. A draft has posted nothing
 * yet, so replacing its line items outright is safe.
 */
export const updateSale = writeAction
  .metadata({ action: 'updated', entity: 'sale' })
  .inputSchema(saleSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.id)).limit(1);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'draft') {
        throw new ActionError(
          'A confirmed sale cannot be edited. Void it and record the correction — the same reason a reversing entry exists for the ledger.',
        );
      }

      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.soldAt, tx)
          : await rateForRecord(input.soldAt, tx);

      // A draft has posted no stock and no cash, so there is nothing to
      // unwind — this only guards the case of a leftover posting.
      await clearDocumentPostings(tx, 'sale', input.id);
      await tx.delete(saleItems).where(eq(saleItems.saleId, input.id));

      let totalCents = 0;
      let totalUsdCents = 0;
      let cogsCents = 0;
      let shortfallTotal = 0;

      for (const [index, item] of input.items.entries()) {
        const lineTotalCents = item.unitPriceCents * item.quantity;
        const lineTotalUsdCents = normaliseToUsd(lineTotalCents, input.currency, rateMicros);
        const unitPriceUsdCents = normaliseToUsd(
          item.unitPriceCents,
          input.currency,
          rateMicros,
        );

        let lineCogs = 0;
        let shortfall = 0;

        if (input.confirm) {
          const consumed = await consumeStockFor(tx, {
            variantId: item.variantId,
            quantity: item.quantity,
            sourceKind: 'sale',
            sourceId: input.id,
            occurredAt: input.soldAt,
            memberId: ctx.member.id,
            note: `${sale.number} at weighted-average landed cost.`,
          });
          lineCogs = consumed.cogsCents;
          shortfall = consumed.shortfall;
        }

        await tx.insert(saleItems).values({
          saleId: input.id,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          unitPriceUsdCents,
          lineTotalUsdCents,
          cogsCents: lineCogs,
          shortfall,
          position: index + 1,
        });

        totalCents += lineTotalCents;
        totalUsdCents += lineTotalUsdCents;
        cogsCents += lineCogs;
        shortfallTotal += shortfall;
      }

      await tx
        .update(sales)
        .set({
          customerId: input.customerId,
          status: input.confirm ? 'confirmed' : 'draft',
          currency: input.currency,
          fxRateMicros: rateMicros,
          totalCents,
          totalUsdCents,
          cogsCents,
          grossProfitCents: totalUsdCents - cogsCents,
          paymentMethod: input.paymentMethod,
          soldAt: input.soldAt,
          notes: input.notes ?? null,
        })
        .where(eq(sales.id, input.id));

      if (input.confirm) {
        await postLedgerEntry(tx, {
          direction: 'in',
          category: 'sales_receipt',
          description: `${sale.number}${input.customerId ? '' : ' (walk-in)'}`,
          currency: input.currency,
          rateMicros,
          amountCents: totalCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.soldAt,
          memberId: ctx.member.id,
          sourceKind: 'sale',
          sourceId: input.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.confirm ? 'confirmed sale' : 'updated draft sale',
        entityType: 'sale',
        entityId: input.id,
        entityLabel: sale.number,
      });

      return { id: input.id, number: sale.number, totalUsdCents, cogsCents, shortfallTotal };
    });

    return result;
  });

/**
 * Confirm a draft sale: this is when it actually happens.
 */
export const confirmSale = writeAction
  .metadata({ action: 'confirmed', entity: 'sale' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.id)).limit(1);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'draft') throw new ActionError('Only a draft can be confirmed.');

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));

      let cogsCents = 0;

      for (const item of items) {
        const consumed = await consumeStockFor(tx, {
          variantId: item.variantId,
          quantity: item.quantity,
          sourceKind: 'sale',
          sourceId: sale.id,
          occurredAt: sale.soldAt,
          memberId: ctx.member.id,
          note: `${sale.number} at weighted-average landed cost.`,
        });

        await tx
          .update(saleItems)
          .set({ cogsCents: consumed.cogsCents, shortfall: consumed.shortfall })
          .where(eq(saleItems.id, item.id));

        cogsCents += consumed.cogsCents;
      }

      await tx
        .update(sales)
        .set({
          status: 'confirmed',
          cogsCents,
          grossProfitCents: sale.totalUsdCents - cogsCents,
        })
        .where(eq(sales.id, sale.id));

      await postLedgerEntry(tx, {
        direction: 'in',
        category: 'sales_receipt',
        description: sale.number,
        currency: sale.currency,
        rateMicros: sale.fxRateMicros,
        amountCents: sale.totalCents,
        paymentMethod: sale.paymentMethod,
        occurredAt: sale.soldAt,
        memberId: ctx.member.id,
        sourceKind: 'sale',
        sourceId: sale.id,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'confirmed sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });

      return sale.number;
    });

    return { number };
  });

/**
 * Void a sale.
 *
 * The row is kept and marked `void` rather than deleted — a numbered document
 * that vanishes is exactly what makes a series untrustworthy. Its stock and
 * cash postings are removed, because those describe movements that did not
 * happen.
 */
export const voidSale = writeAction
  .metadata({ action: 'voided', entity: 'sale' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().max(500).optional() }))
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.id)).limit(1);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status === 'void') throw new ActionError('That sale is already void.');

      await clearDocumentPostings(tx, 'sale', sale.id);

      await tx
        .update(sales)
        .set({
          status: 'void',
          cogsCents: 0,
          grossProfitCents: 0,
          notes: input.reason
            ? `${sale.notes ? `${sale.notes}\n` : ''}Voided: ${input.reason}`
            : sale.notes,
        })
        .where(eq(sales.id, sale.id));

      await tx
        .update(saleItems)
        .set({ cogsCents: 0, shortfall: 0 })
        .where(eq(saleItems.saleId, sale.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'voided sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });

      return sale.number;
    });

    return { number };
  });

/**
 * Return items from a confirmed sale.
 *
 * The sale itself stays exactly as it was — it happened, and rewriting it
 * would rewrite a margin someone has already relied on, the same reason
 * `updateSale` refuses a confirmed sale. Instead the return posts the
 * reverse of the sale's consequences:
 *
 *   stock  the goods come back in at the cost they went out at, so the
 *          weighted average is restored rather than re-priced;
 *   cash   the refund leaves in the currency it arrived in, at the rate the
 *          sale fixed, so the reversal nets against the original receipt;
 *   margin the line's returned portion is tracked on `quantity_returned`,
 *          leaving the original figures intact beside it.
 *
 * The amounts are derived, never typed: each returned share is
 * `returnedPortion` of the line, so partial returns across time always foot
 * to the line exactly. A written reason is required — this reverses
 * postings, the same tier of friction as void and reversal.
 */
export const returnSaleItems = writeAction
  .metadata({ action: 'returned', entity: 'sale' })
  .inputSchema(
    z.object({
      saleId: uuid,
      reason: z.string().trim().min(3, 'Say why the goods came back').max(500),
      items: z
        .array(z.object({ saleItemId: uuid, quantity }))
        .min(1, 'Return at least one unit'),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError(
          sale.status === 'draft'
            ? 'A draft has moved nothing — edit or void it instead of returning against it.'
            : 'A void sale has already had its postings removed; there is nothing to reverse.',
        );
      }

      const items = await tx
        .select()
        .from(saleItems)
        .where(
          and(
            eq(saleItems.saleId, sale.id),
            inArray(
              saleItems.id,
              input.items.map((item) => item.saleItemId),
            ),
          ),
        );

      const byId = new Map(items.map((item) => [item.id, item]));

      let refundCents = 0;
      let restockedCents = 0;
      let units = 0;
      const returnedAt = new Date();

      for (const line of input.items) {
        const item = byId.get(line.saleItemId);
        if (!item) throw new ActionError('One of those lines is not on this sale.');

        const returnable = item.quantity - item.quantityReturned;
        if (line.quantity > returnable) {
          throw new ActionError(
            returnable === 0
              ? 'That line has already been returned in full.'
              : `Only ${returnable} unit${returnable === 1 ? '' : 's'} of that line can still be returned.`,
          );
        }

        const refund = returnedPortion(
          item.unitPriceCents * item.quantity,
          item.quantity,
          item.quantityReturned,
          line.quantity,
        );
        const restock = returnedPortion(
          item.cogsCents,
          item.quantity,
          item.quantityReturned,
          line.quantity,
        );

        await postStockMovement(tx, {
          variantId: item.variantId,
          kind: 'return',
          quantity: line.quantity,
          valueCents: restock,
          sourceKind: 'sale',
          sourceId: sale.id,
          occurredAt: returnedAt,
          note: `Returned from ${sale.number}.`,
          memberId: ctx.member.id,
        });

        await tx
          .update(saleItems)
          .set({ quantityReturned: item.quantityReturned + line.quantity })
          .where(eq(saleItems.id, item.id));

        refundCents += refund;
        restockedCents += restock;
        units += line.quantity;
      }

      // A line can be free (price zero) and still come back; only money that
      // actually moves gets a ledger entry.
      if (refundCents > 0) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'refund',
          description: `Refund ${sale.number}`,
          currency: sale.currency,
          rateMicros: sale.fxRateMicros,
          amountCents: refundCents,
          paymentMethod: sale.paymentMethod,
          occurredAt: returnedAt,
          memberId: ctx.member.id,
          sourceKind: 'sale',
          sourceId: sale.id,
          notes: input.reason,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'recorded return on sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });

      return {
        number: sale.number,
        currency: sale.currency,
        refundCents,
        refundUsdCents: normaliseToUsd(refundCents, sale.currency, sale.fxRateMicros),
        restockedCents,
        units,
      };
    });

    return result;
  });
