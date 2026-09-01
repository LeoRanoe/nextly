'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normaliseToUsd } from '@/lib/fx';
import {
  expenseSchema,
  fxRateSchema,
  ledgerEntrySchema,
  settingsSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import { expenses, fxRates, ledgerEntries, settings } from '../db/schema';
import { clearDocumentPostings, logActivity, postLedgerEntry } from '../services/posting';
import { rateForRecord, rateOn } from '../services/rates';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * An expense is money leaving the business, so by default it posts to the cash
 * ledger as well. The toggle exists for the case where the payment was already
 * entered by hand — without it, importing historical expenses would
 * double-count every one of them.
 */
export const createExpense = writeAction
  .metadata({ action: 'created', entity: 'expense' })
  .inputSchema(expenseSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);

      const [expense] = await tx
        .insert(expenses)
        .values({
          description: input.description,
          categoryId: input.categoryId,
          currency: input.currency,
          fxRateMicros: rateMicros,
          amountCents: input.amountCents,
          amountUsdCents: normaliseToUsd(input.amountCents, input.currency, rateMicros),
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          notes: input.notes ?? null,
          createdById: ctx.member.id,
        })
        .returning();

      if (!expense) throw new ActionError('Could not record the expense.');

      if (input.postToLedger) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'operating',
          description: input.description,
          currency: input.currency,
          rateMicros,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          memberId: ctx.member.id,
          sourceKind: 'expense',
          sourceId: expense.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'logged expense',
        entityType: 'expense',
        entityId: expense.id,
        entityLabel: input.description,
      });

      return { id: expense.id, description: input.description };
    });
    return result;
  });

export const updateExpense = writeAction
  .metadata({ action: 'updated', entity: 'expense' })
  .inputSchema(expenseSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That expense no longer exists.');

      // Re-resolved from the (possibly changed) date, not read off the
      // existing row: moving an expense to a different day must not leave it
      // valued at the rate that was in force on the old one.
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);

      await tx
        .update(expenses)
        .set({
          description: input.description,
          categoryId: input.categoryId,
          currency: input.currency,
          fxRateMicros: rateMicros,
          amountCents: input.amountCents,
          amountUsdCents: normaliseToUsd(input.amountCents, input.currency, rateMicros),
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          notes: input.notes ?? null,
        })
        .where(eq(expenses.id, input.id));

      // Clear whatever it posted before and re-post at the new numbers —
      // the simplest way to keep the ledger from disagreeing with an edited
      // expense is to never let the old posting and the new one coexist.
      await clearDocumentPostings(tx, 'expense', input.id);
      if (input.postToLedger) {
        await postLedgerEntry(tx, {
          direction: 'out',
          category: 'operating',
          description: input.description,
          currency: input.currency,
          rateMicros,
          amountCents: input.amountCents,
          paymentMethod: input.paymentMethod,
          occurredAt: input.occurredAt,
          memberId: ctx.member.id,
          sourceKind: 'expense',
          sourceId: input.id,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated expense',
        entityType: 'expense',
        entityId: input.id,
        entityLabel: input.description,
      });

      return { id: input.id, description: input.description };
    });
    return result;
  });

/** `ownerAction`, matching the RLS policy: DELETE is granted to
 *  `private.is_owner()` only, and Drizzle bypasses RLS, so the app layer is
 *  what actually enforces this. */
export const deleteExpense = ownerAction
  .metadata({ action: 'deleted', entity: 'expense' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const description = await db.transaction(async (tx) => {
      const [expense] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.id))
        .limit(1);

      if (!expense) throw new ActionError('That expense no longer exists.');

      // Its ledger entry described a payment that is being retracted, so it
      // goes too. Anything else would leave cash reduced by a cost that no
      // longer exists. Routed through the posting service rather than a raw
      // DELETE, so this stays the only place that ever removes a posting.
      await clearDocumentPostings(tx, 'expense', expense.id);
      await tx.delete(expenses).where(eq(expenses.id, expense.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'deleted expense',
        entityType: 'expense',
        entityLabel: expense.description,
      });

      return expense.description;
    });
    return { description };
  });

/**
 * A manual cash movement: capital in, an owner draw, anything not already
 * posted by a document.
 *
 * Entries created here are `source_kind = 'manual'` on purpose. That is what
 * lets the Overview compare document-posted cash against the documents
 * themselves and flag drift, which is how it found the spreadsheet's $147.01
 * and $130 discrepancies.
 */
export const createLedgerEntry = writeAction
  .metadata({ action: 'created', entity: 'ledger entry' })
  .inputSchema(ledgerEntrySchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const rateMicros =
        input.currency === 'SRD'
          ? await rateOn(input.occurredAt, tx)
          : await rateForRecord(input.occurredAt, tx);

      await postLedgerEntry(tx, {
        direction: input.direction,
        category: input.category,
        description: input.description,
        currency: input.currency,
        rateMicros,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
        occurredAt: input.occurredAt,
        memberId: ctx.member.id,
        principalId: input.memberId,
        notes: input.notes ?? null,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `recorded cash ${input.direction}`,
        entityType: 'ledger_entry',
        entityLabel: input.description,
      });
    });
    return { description: input.description };
  });

/**
 * Reverse a ledger entry.
 *
 * The original is never deleted — `ledger_entries` is append-only, and that is
 * the property that makes the cash history worth trusting. A correction is a
 * new, opposite entry that points back at what it reverses.
 */
export const reverseLedgerEntry = writeAction
  .metadata({ action: 'reversed', entity: 'ledger entry' })
  .inputSchema(z.object({ id: uuid, reason: z.string().trim().min(3).max(500) }))
  .action(async ({ parsedInput: input, ctx }) => {
    const description = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.id, input.id))
        .limit(1);

      if (!entry) throw new ActionError('That entry no longer exists.');

      await postLedgerEntry(tx, {
        direction: entry.direction === 'in' ? 'out' : 'in',
        category: entry.category,
        description: `Reversal of ${entry.description}`,
        currency: entry.currency,
        rateMicros: entry.fxRateMicros,
        amountCents: entry.amountCents,
        paymentMethod: entry.paymentMethod,
        occurredAt: new Date(),
        memberId: ctx.member.id,
        principalId: entry.memberId,
        notes: input.reason,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'reversed ledger entry',
        entityType: 'ledger_entry',
        entityId: entry.id,
        entityLabel: entry.description,
      });

      return entry.description;
    });
    return { description };
  });

/**
 * Record a new exchange rate.
 *
 * Always an insert, never an update. Past transactions keep the rate they were
 * recorded with, which is the whole reason this is a dated series rather than a
 * setting — see ADR-0001 and `docs/02-data/money-and-fx.md`.
 */
export const createFxRate = writeAction
  .metadata({ action: 'created', entity: 'exchange rate' })
  .inputSchema(fxRateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      await tx.insert(fxRates).values({
        base: 'USD',
        quote: 'SRD',
        rateMicros: input.rate,
        effectiveFrom: input.effectiveFrom,
        source: 'manual',
        note: input.note ?? null,
        createdById: ctx.member.id,
      });

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'set exchange rate',
        entityType: 'fx_rate',
        entityLabel: `${(input.rate / 1_000_000).toFixed(4)} SRD/USD`,
      });
    });
    return { rate: input.rate };
  });

export const updateSettings = ownerAction
  .metadata({ action: 'updated', entity: 'settings' })
  .inputSchema(settingsSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(settings).limit(1);

      if (existing) {
        await tx
          .update(settings)
          .set({
            businessName: input.businessName,
            displayCurrency: input.displayCurrency,
            lowStockThreshold: input.lowStockThreshold,
          })
          .where(eq(settings.id, existing.id));
      } else {
        await tx.insert(settings).values({
          businessName: input.businessName,
          displayCurrency: input.displayCurrency,
          lowStockThreshold: input.lowStockThreshold,
        });
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated settings',
        entityType: 'settings',
        entityLabel: input.businessName,
      });
    });
    return { businessName: input.businessName };
  });
