'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { returnedPortion } from '@/lib/costing';
import type { RateMicros } from '@/lib/fx';
import { normaliseToUsd } from '@/lib/fx';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney } from '@/lib/money';
import { balanceCentsOf, paymentStatusOf } from '@/lib/payment-status';
import {
  moneyInput,
  quantity,
  salePaymentSchema,
  saleRefundSchema,
  saleSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import {
  products,
  productVariants,
  saleItemSerials,
  saleItems,
  salePayments,
  saleRefunds,
  sales,
} from '../db/schema';
import {
  clearDocumentPostings,
  consumeStockFor,
  lockValuation,
  lockVariant,
  logActivity,
  nextDocumentNumber,
  type PaymentMethod as PaymentMethodName,
  postLedgerEntry,
  postStockMovement,
  type Tx,
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

/**
 * Record money received against a sale and post its receipt (F-4).
 *
 * The ledger entry is tagged with the *payment's* id, not the sale's. That is
 * deliberate: `clearDocumentPostings(tx, 'sale', saleId)` removes what a sale
 * posted whenever it is edited or voided, and receipts for money that actually
 * arrived must survive that. The payment row and its receipt are created and
 * destroyed together, so derived `paid` can never disagree with banked cash.
 */
async function insertPayment(
  tx: Tx,
  input: {
    saleId: string;
    number: string;
    amountCents: Cents;
    currency: CurrencyCode;
    rateMicros: RateMicros;
    method: PaymentMethodName;
    receivedAt: Date;
    memberId: string;
    notes?: string | null;
    idempotencyKey?: string;
  },
): Promise<{ id: string; amountCents: Cents; reused: boolean }> {
  if (input.amountCents <= 0) throw new ActionError('A payment must be more than zero.');

  if (input.idempotencyKey) {
    const [existing] = await tx
      .select({ id: salePayments.id, amountCents: salePayments.amountCents })
      .from(salePayments)
      .where(
        and(
          eq(salePayments.saleId, input.saleId),
          eq(salePayments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { id: existing.id, amountCents: existing.amountCents, reused: true };
  }

  const [payment] = await tx
    .insert(salePayments)
    .values({
      saleId: input.saleId,
      amountCents: input.amountCents,
      currency: input.currency,
      fxRateMicros: input.rateMicros,
      method: input.method,
      receivedAt: input.receivedAt,
      notes: input.notes ?? null,
      memberId: input.memberId,
      createdById: input.memberId,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();

  if (!payment) throw new ActionError('Could not record the payment.');

  await postLedgerEntry(tx, {
    direction: 'in',
    category: 'sales_receipt',
    description: `${input.number} · payment`,
    currency: input.currency,
    rateMicros: input.rateMicros,
    amountCents: input.amountCents,
    paymentMethod: input.method,
    occurredAt: input.receivedAt,
    memberId: input.memberId,
    sourceKind: 'sale',
    sourceId: payment.id,
  });

  return { id: payment.id, amountCents: input.amountCents, reused: false };
}

/** What has been paid on a sale so far, in the currency of the sale. */
async function paidOnSale(tx: Tx, saleId: string): Promise<Cents> {
  const [row] = await tx.execute<{ paid: string }>(
    sql`SELECT (
      COALESCE((SELECT SUM(amount_cents) FROM sale_payments WHERE sale_id = ${saleId}), 0)
      + COALESCE((
          SELECT SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END)
            FROM ledger_entries
           WHERE source_kind = 'sale'
             AND source_id = ${saleId}
             AND category = 'sales_receipt'
        ), 0)
    )::text AS paid`,
  );
  return Number(row?.paid ?? 0);
}

async function refundedOnSale(tx: Tx, saleId: string): Promise<Cents> {
  const [row] = await tx.execute<{ refunded: string }>(sql`
    SELECT (
      COALESCE((SELECT SUM(amount_cents) FROM sale_refunds WHERE sale_id = ${saleId}), 0)
      + COALESCE((
          SELECT SUM(amount_cents)
            FROM ledger_entries
           WHERE source_kind = 'sale'
             AND source_id = ${saleId}
             AND category = 'refund'
             AND direction = 'out'
        ), 0)
    )::text AS refunded
  `);
  return Number(row?.refunded ?? 0);
}

async function lockSale(tx: Tx, saleId: string) {
  await tx.execute(sql`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`);
  const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  return sale;
}

async function assertSellableVariants(tx: Tx, variantIds: string[]): Promise<void> {
  if (new Set(variantIds).size !== variantIds.length) {
    throw new ActionError('Add each product variant only once per sale.');
  }

  const rows = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        inArray(productVariants.id, variantIds),
        eq(productVariants.isActive, true),
        sql`${products.status} <> 'archived'`,
      ),
    );
  if (rows.length !== variantIds.length) {
    throw new ActionError('Every sale item must be an active product variant.');
  }
}

async function lockSaleVariants(tx: Tx, variantIds: string[]): Promise<void> {
  for (const variantId of [...new Set(variantIds)].sort()) await lockVariant(tx, variantId);
}

const returnItemsSchema = z
  .array(z.object({ saleItemId: uuid, quantity }))
  .min(1, 'Return at least one unit')
  .superRefine((items, ctx) => {
    const ids = new Set(items.map((item) => item.saleItemId));
    if (ids.size !== items.length) {
      ctx.addIssue({ code: 'custom', message: 'Choose each sale line only once.' });
    }
  });
export const createSale = writeAction
  .metadata({ action: 'created', entity: 'sale' })
  .inputSchema(saleSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      await assertSellableVariants(
        tx,
        input.items.map((item) => item.variantId),
      );
      await lockSaleVariants(
        tx,
        input.items.map((item) => item.variantId),
      );
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

      let grossCents = 0;
      let grossUsdCents = 0;
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

        const [line] = await tx
          .insert(saleItems)
          .values({
            saleId: sale.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            unitPriceUsdCents,
            lineTotalUsdCents,
            cogsCents: lineCogs,
            shortfall,
            position: index + 1,
          })
          .returning({ id: saleItems.id });

        if (line && item.serials.length > 0) {
          await tx
            .insert(saleItemSerials)
            .values(item.serials.map((serial) => ({ saleItemId: line.id, serial })));
        }

        grossCents += lineTotalCents;
        grossUsdCents += lineTotalUsdCents;
        cogsCents += lineCogs;
        shortfallTotal += shortfall;
      }

      // The discount is subtracted from the document, never from the lines:
      // `sale_items` keeps what each product was charged at so price
      // realisation stays measurable, while `total_*` is what is payable and
      // what the receipt posts for.
      const discountUsdCents = normaliseToUsd(input.discountCents, input.currency, rateMicros);
      const totalCents = grossCents - input.discountCents;
      const totalUsdCents = grossUsdCents - discountUsdCents;

      await tx
        .update(sales)
        .set({
          totalCents,
          totalUsdCents,
          discountCents: input.discountCents,
          discountReason: input.discountReason ?? null,
          cogsCents,
          grossProfitCents: totalUsdCents - cogsCents,
        })
        .where(eq(sales.id, sale.id));

      // A draft has not happened yet, so it moves no cash. A confirmed sale
      // whose money has not arrived posts nothing either (F-4): the balance
      // stays receivable until each payment banks its own receipt. Every
      // amount that did arrive, including a paid-in-full sale, goes through
      // insertPayment so the payment row and its ledger receipt cannot drift.
      if (input.confirm) {
        const paidNow = input.paidInFull ? totalCents : (input.paidNowCents ?? 0);
        if (paidNow >= totalCents && totalCents > 0) {
          await insertPayment(tx, {
            saleId: sale.id,
            number: `${number}${input.customerId ? '' : ' (walk-in)'}`,
            amountCents: totalCents,
            currency: input.currency,
            rateMicros,
            method: input.paymentMethod,
            receivedAt: input.soldAt,
            memberId: ctx.member.id,
          });
        } else if (paidNow > 0 && totalCents > 0) {
          await insertPayment(tx, {
            saleId: sale.id,
            number,
            amountCents: paidNow,
            currency: input.currency,
            rateMicros,
            method: input.paymentMethod,
            receivedAt: input.soldAt,
            memberId: ctx.member.id,
          });
        }
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
      const sale = await lockSale(tx, input.id);
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
      // unwind — this only guards the case of a leftover posting. Payments are
      // checked because their receipts are tagged with the payment's own id
      // and would survive that cleanup: money on a draft means something went
      // wrong earlier, and silently orphaning it is worse than refusing.
      if ((await paidOnSale(tx, input.id)) > 0) {
        throw new ActionError(
          'Money has already been recorded against this sale. Void it and record the correction instead.',
        );
      }
      await assertSellableVariants(
        tx,
        input.items.map((item) => item.variantId),
      );
      await lockSaleVariants(
        tx,
        input.items.map((item) => item.variantId),
      );
      await clearDocumentPostings(tx, 'sale', input.id);
      await tx.delete(saleItems).where(eq(saleItems.saleId, input.id));

      let grossCents = 0;
      let grossUsdCents = 0;
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

        const [line] = await tx
          .insert(saleItems)
          .values({
            saleId: input.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            unitPriceUsdCents,
            lineTotalUsdCents,
            cogsCents: lineCogs,
            shortfall,
            position: index + 1,
          })
          .returning({ id: saleItems.id });

        if (line && item.serials.length > 0) {
          await tx
            .insert(saleItemSerials)
            .values(item.serials.map((serial) => ({ saleItemId: line.id, serial })));
        }

        grossCents += lineTotalCents;
        grossUsdCents += lineTotalUsdCents;
        cogsCents += lineCogs;
        shortfallTotal += shortfall;
      }

      const discountUsdCents = normaliseToUsd(input.discountCents, input.currency, rateMicros);
      const totalCents = grossCents - input.discountCents;
      const totalUsdCents = grossUsdCents - discountUsdCents;

      await tx
        .update(sales)
        .set({
          customerId: input.customerId,
          status: input.confirm ? 'confirmed' : 'draft',
          currency: input.currency,
          fxRateMicros: rateMicros,
          totalCents,
          totalUsdCents,
          discountCents: input.discountCents,
          discountReason: input.discountReason ?? null,
          cogsCents,
          grossProfitCents: totalUsdCents - cogsCents,
          paymentMethod: input.paymentMethod,
          soldAt: input.soldAt,
          notes: input.notes ?? null,
        })
        .where(eq(sales.id, input.id));

      if (input.confirm) {
        const paidNow = input.paidInFull ? totalCents : (input.paidNowCents ?? 0);
        if (paidNow >= totalCents && totalCents > 0) {
          await insertPayment(tx, {
            saleId: input.id,
            number: `${sale.number}${input.customerId ? '' : ' (walk-in)'}`,
            amountCents: totalCents,
            currency: input.currency,
            rateMicros,
            method: input.paymentMethod,
            receivedAt: input.soldAt,
            memberId: ctx.member.id,
          });
        } else if (paidNow > 0 && totalCents > 0) {
          await insertPayment(tx, {
            saleId: input.id,
            number: sale.number,
            amountCents: paidNow,
            currency: input.currency,
            rateMicros,
            method: input.paymentMethod,
            receivedAt: input.soldAt,
            memberId: ctx.member.id,
          });
        }
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
 *
 * `paidInFull` decides what happens to the money (F-4). A full payment and a
 * deposit both become payment rows with their own ledger receipt. "Later"
 * posts nothing: stock moves and margin books, but the cash stays receivable
 * until each payment arrives.
 */
export const confirmSale = writeAction
  .metadata({ action: 'confirmed', entity: 'sale' })
  .inputSchema(
    z.object({
      id: uuid,
      paidInFull: z.boolean().default(true),
      /** Only meaningful with `paidInFull: false`; clamped below the total by
       *  the code below, because the total lives in the database, not here. */
      paidNowCents: moneyInput.default(0),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const number = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.id);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'draft') throw new ActionError('Only a draft can be confirmed.');

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      await lockSaleVariants(
        tx,
        items.map((item) => item.variantId),
      );

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
          invoiceNumber: sale.invoiceNumber ?? (await nextDocumentNumber(tx, 'INV-')),
          cogsCents,
          grossProfitCents: sale.totalUsdCents - cogsCents,
        })
        .where(eq(sales.id, sale.id));

      const alreadyPaid = await paidOnSale(tx, sale.id);
      const paidNow = Math.min(
        input.paidInFull ? sale.totalCents : input.paidNowCents + alreadyPaid,
        sale.totalCents,
      );

      if (paidNow >= sale.totalCents && alreadyPaid === 0 && sale.totalCents > 0) {
        await insertPayment(tx, {
          saleId: sale.id,
          number: sale.number,
          amountCents: sale.totalCents,
          currency: sale.currency,
          rateMicros: sale.fxRateMicros,
          method: sale.paymentMethod,
          receivedAt: sale.soldAt,
          memberId: ctx.member.id,
        });
      } else if (paidNow > alreadyPaid) {
        await insertPayment(tx, {
          saleId: sale.id,
          number: sale.number,
          amountCents: paidNow - alreadyPaid,
          currency: sale.currency,
          rateMicros: sale.fxRateMicros,
          method: sale.paymentMethod,
          receivedAt: sale.soldAt,
          memberId: ctx.member.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: input.paidInFull ? 'confirmed sale' : 'confirmed sale on credit',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });

      return sale.number;
    });

    return { number };
  });

/**
 * Record money received against a sale (F-4).
 *
 * Overpaying is refused rather than rounded down: an extra cent in the ledger
 * that matches no invoice is exactly the drift this whole system exists to
 * prevent, and the cashier can look at the balance shown beside the form and
 * type what was actually handed over.
 */
export const recordSalePayment = writeAction
  .metadata({ action: 'recorded', entity: 'sale_payment' })
  .inputSchema(salePaymentSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError(
          sale.status === 'draft'
            ? 'A draft has not happened yet — confirm it before collecting money on it.'
            : 'That sale is void; nothing is owed on it.',
        );
      }

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select({ amountCents: salePayments.amountCents })
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, sale.id),
              eq(salePayments.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const paid = await paidOnSale(tx, sale.id);
          return {
            number: sale.number,
            currency: sale.currency,
            amountCents: existing.amountCents,
            paymentStatus: paymentStatusOf(sale.totalCents, paid),
            balanceCents: balanceCentsOf(sale.totalCents, paid),
          };
        }
      }

      const alreadyPaid = await paidOnSale(tx, sale.id);
      const balance = balanceCentsOf(sale.totalCents, alreadyPaid);
      if (balance <= 0) throw new ActionError('That sale is already paid in full.');
      if (input.amountCents > balance) {
        throw new ActionError(
          `That is more than the outstanding balance (${formatMoney(balance, sale.currency)}).`,
        );
      }

      const payment = await insertPayment(tx, {
        saleId: sale.id,
        number: sale.number,
        amountCents: input.amountCents,
        currency: sale.currency,
        rateMicros: sale.fxRateMicros,
        method: input.paymentMethod,
        receivedAt: input.receivedAt ?? new Date(),
        memberId: ctx.member.id,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'recorded payment on sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: {
          paid_cents: { from: alreadyPaid, to: alreadyPaid + input.amountCents },
        },
      });

      const paid = alreadyPaid + payment.amountCents;
      return {
        number: sale.number,
        currency: sale.currency,
        amountCents: payment.amountCents,
        paymentStatus: paymentStatusOf(sale.totalCents, paid),
        balanceCents: balanceCentsOf(sale.totalCents, paid),
      };
    });

    return result;
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
      const sale = await lockSale(tx, input.id);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status === 'void') throw new ActionError('That sale is already void.');

      const paid = await paidOnSale(tx, sale.id);
      if (paid > 0) {
        throw new ActionError(
          'This sale has payments. Refund them through the refund workflow before voiding it.',
        );
      }
      const [returned] = await tx.execute<{ units: string }>(
        sql`SELECT COALESCE(SUM(quantity_returned), 0)::text AS units FROM sale_items WHERE sale_id = ${sale.id}`,
      );
      if (Number(returned?.units ?? 0) > 0) {
        throw new ActionError('This sale has returned items and cannot be voided.');
      }

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
 *   cash   no money moves automatically. The return creates a derived credit
 *          due; `refundSale` is the separate action that pays it out.
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
      items: returnItemsSchema,
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
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
      await lockSaleVariants(
        tx,
        items.map((item) => item.variantId),
      );

      let creditCents = 0;
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

        // A return and a sale/receipt touching the same variant must share the
        // same row lock, even when the return itself does not need a valuation.
        await lockValuation(tx, item.variantId);
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

        creditCents += refund;
        restockedCents += restock;
        units += line.quantity;
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
        creditCents,
        creditUsdCents: normaliseToUsd(creditCents, sale.currency, sale.fxRateMicros),
        restockedCents,
        units,
      };
    });

    return result;
  });

/**
 * Pay out a credit created by a return. This is intentionally separate from
 * `returnSaleItems`: goods can be accepted back while the customer chooses a
 * replacement or store credit, and cash must never leave merely because stock
 * was restocked.
 */
export const refundSale = writeAction
  .metadata({ action: 'refunded', entity: 'sale' })
  .inputSchema(saleRefundSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError('Only a confirmed sale can be refunded.');
      }

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select({ amountCents: saleRefunds.amountCents })
          .from(saleRefunds)
          .where(
            and(
              eq(saleRefunds.saleId, sale.id),
              eq(saleRefunds.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const refundedCents = await refundedOnSale(tx, sale.id);
          return {
            number: sale.number,
            currency: sale.currency,
            amountCents: existing.amountCents,
            refundedCents,
            refundableCents: Math.max(0, (await paidOnSale(tx, sale.id)) - refundedCents),
          };
        }
      }

      const paidCents = await paidOnSale(tx, sale.id);
      const refundedCents = await refundedOnSale(tx, sale.id);
      const refundableCents = paidCents - refundedCents;
      if (refundableCents <= 0) {
        throw new ActionError('There is no received money left to refund on this sale.');
      }
      if (input.amountCents > refundableCents) {
        throw new ActionError(
          `That is more than the refundable balance (${formatMoney(refundableCents, sale.currency)}).`,
        );
      }

      const refundedAt = input.refundedAt ?? new Date();
      const [refund] = await tx
        .insert(saleRefunds)
        .values({
          saleId: sale.id,
          amountCents: input.amountCents,
          currency: sale.currency,
          fxRateMicros: sale.fxRateMicros,
          method: input.paymentMethod,
          refundedAt,
          reason: input.reason,
          memberId: ctx.member.id,
          createdById: ctx.member.id,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning({ id: saleRefunds.id });
      if (!refund) throw new ActionError('Could not record the refund.');

      await postLedgerEntry(tx, {
        direction: 'out',
        category: 'refund',
        description: `Refund ${sale.number}`,
        currency: sale.currency,
        rateMicros: sale.fxRateMicros,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        occurredAt: refundedAt,
        memberId: ctx.member.id,
        sourceKind: 'sale',
        sourceId: refund.id,
        notes: input.reason,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'refunded sale',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
        diff: {
          refunded_cents: { from: refundedCents, to: refundedCents + input.amountCents },
        },
      });

      return {
        number: sale.number,
        currency: sale.currency,
        amountCents: input.amountCents,
        refundedCents: refundedCents + input.amountCents,
        refundableCents: refundableCents - input.amountCents,
      };
    });

    return result;
  });
