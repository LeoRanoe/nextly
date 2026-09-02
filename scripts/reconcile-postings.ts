/**
 * One-off reconciliation for legacy cash postings.
 *
 * This is intentionally fail-closed. It must be run only after the payment
 * migrations have been applied, with an explicit confirmation:
 *
 *   $env:RECONCILE_POSTINGS_CONFIRM = 'yes'
 *   pnpm exec tsx scripts/reconcile-postings.ts
 *
 * The script preserves the old ledger rows, adds reversing entries, and
 * creates the payment rows the current application derives balances from. It
 * is safe to rerun after a completed run: each conversion has a durable
 * payment row or reversal marker that makes it a no-op next time.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/server/db/client';
import {
  ledgerEntries,
  purchaseOrderPayments,
  purchaseOrders,
  salePayments,
  sales,
} from '../src/server/db/schema';
import { postLedgerEntry, type Tx } from '../src/server/services/posting';

function actorId(...ids: (string | null | undefined)[]): string {
  const id = ids.find(Boolean);
  if (!id) throw new Error('A legacy row has no member to attribute the reconciliation to.');
  return id;
}

async function reverseEntry(
  tx: Tx,
  entry: typeof ledgerEntries.$inferSelect,
  description: string,
  notes: string,
  memberId = actorId(entry.createdById, entry.memberId),
): Promise<void> {
  await postLedgerEntry(tx, {
    direction: entry.direction === 'in' ? 'out' : 'in',
    category: entry.category,
    description,
    currency: entry.currency,
    rateMicros: entry.fxRateMicros,
    amountCents: entry.amountCents,
    paymentMethod: entry.paymentMethod,
    occurredAt: new Date(),
    memberId,
    sourceKind: entry.sourceKind,
    sourceId: entry.sourceId,
    notes,
  });
}

async function ensureSalePayment(
  tx: Tx,
  sale: typeof sales.$inferSelect,
  input: {
    amountCents: number;
    currency: typeof sale.currency;
    rateMicros: number;
    method: typeof sale.paymentMethod;
    receivedAt: Date;
    memberId: string;
    notes: string;
  },
): Promise<void> {
  const [payment] = await tx
    .insert(salePayments)
    .values({
      saleId: sale.id,
      amountCents: input.amountCents,
      currency: input.currency,
      fxRateMicros: input.rateMicros,
      method: input.method,
      receivedAt: input.receivedAt,
      notes: input.notes,
      memberId: input.memberId,
      createdById: input.memberId,
    })
    .returning();

  if (!payment) throw new Error(`Could not create the payment row for ${sale.number}.`);

  await postLedgerEntry(tx, {
    direction: 'in',
    category: 'sales_receipt',
    description: `${sale.number} · payment`,
    currency: input.currency,
    rateMicros: input.rateMicros,
    amountCents: input.amountCents,
    paymentMethod: input.method,
    occurredAt: input.receivedAt,
    memberId: input.memberId,
    sourceKind: 'sale',
    sourceId: payment.id,
    notes: input.notes,
  });
}

async function reconcileSales(tx: Tx): Promise<void> {
  const confirmedSales = await tx
    .select()
    .from(sales)
    .where(eq(sales.status, 'confirmed'))
    .orderBy(sales.soldAt);

  for (const sale of confirmedSales) {
    const payments = await tx
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, sale.id));

    // Repair a payment row whose ledger receipt was lost, without creating a
    // second payment row.
    for (const payment of payments) {
      const [receipt] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.sourceKind, 'sale'),
            eq(ledgerEntries.sourceId, payment.id),
            eq(ledgerEntries.category, 'sales_receipt'),
          ),
        )
        .limit(1);

      if (!receipt) {
        const memberId = actorId(payment.createdById, payment.memberId, sale.createdById);
        await postLedgerEntry(tx, {
          direction: 'in',
          category: 'sales_receipt',
          description: `${sale.number} · payment`,
          currency: payment.currency,
          rateMicros: payment.fxRateMicros,
          amountCents: payment.amountCents,
          paymentMethod: payment.method,
          occurredAt: payment.receivedAt,
          memberId,
          sourceKind: 'sale',
          sourceId: payment.id,
          notes: 'Restored during reconciliation — payment row already existed.',
        });
        console.log(`  Restored receipt for ${sale.number}.`);
      }
    }

    if (payments.length > 0) {
      console.log(`  ${sale.number} already has payment rows — checked receipts.`);
      continue;
    }

    const legacyReceipts = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.sourceKind, 'sale'),
          eq(ledgerEntries.sourceId, sale.id),
          eq(ledgerEntries.category, 'sales_receipt'),
          eq(ledgerEntries.direction, 'in'),
        ),
      );

    if (legacyReceipts.length > 0) {
      // Move old direct receipts behind the payment identity used by the new
      // code, then reverse the old source so the cash total stays unchanged.
      for (const legacy of legacyReceipts) {
        const memberId = actorId(legacy.createdById, legacy.memberId, sale.createdById);
        await ensureSalePayment(tx, sale, {
          amountCents: legacy.amountCents,
          currency: legacy.currency,
          rateMicros: legacy.fxRateMicros,
          method: legacy.paymentMethod,
          receivedAt: legacy.occurredAt,
          memberId,
          notes: 'Migrated from the legacy direct sale receipt.',
        });
        await reverseEntry(
          tx,
          legacy,
          `Reversal of legacy ${sale.number} receipt`,
          'Reconciliation — replaced by a payment-specific receipt.',
          memberId,
        );
      }
      console.log(`  Migrated legacy receipt(s) for ${sale.number}.`);
      continue;
    }

    if (sale.totalCents <= 0) {
      console.log(`  ${sale.number} is zero-value — no cash receipt needed.`);
      continue;
    }

    // The original workbook's confirmed sales were collected into the manual
    // "Inkomsten" lump. This assumption is why the whole script is gated by
    // RECONCILE_POSTINGS_CONFIRM and must be approved against the bank records.
    await ensureSalePayment(tx, sale, {
      amountCents: sale.totalCents,
      currency: sale.currency,
      rateMicros: sale.fxRateMicros,
      method: sale.paymentMethod,
      receivedAt: sale.soldAt,
      memberId: actorId(sale.createdById),
      notes: 'Reconciliation — collected sale represented by the legacy Inkomsten lump.',
    });
    console.log(`  Created payment receipt for ${sale.number}.`);
  }
}

async function reconcileLegacySalesLump(tx: Tx): Promise<void> {
  const [inkomsten] = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.category, 'sales_receipt'),
        eq(ledgerEntries.sourceKind, 'manual'),
        eq(ledgerEntries.description, 'Inkomsten'),
      ),
    )
    .limit(1);

  if (!inkomsten) {
    console.log('  No "Inkomsten" entry found — skipping lump reversal.');
    return;
  }

  const [reversal] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.category, 'sales_receipt'),
        eq(ledgerEntries.sourceKind, 'manual'),
        sql`${ledgerEntries.description} LIKE ${'Reversal: Inkomsten (%'}`,
      ),
    )
    .limit(1);

  if (reversal) {
    console.log('  "Inkomsten" was already reversed — skipping.');
    return;
  }

  await reverseEntry(
    tx,
    inkomsten,
    'Reversal: Inkomsten (replaced by per-sale payment receipts during reconciliation)',
    'Reconciliation — reversed in favour of payment-specific receipts.',
  );
  console.log('  Reversed legacy "Inkomsten" entry.');
}

async function reconcileLegacyPurchase(tx: Tx): Promise<void> {
  const [order] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.number, 'PO-001'))
    .limit(1);
  if (!order) {
    console.log('  PO-001 not found — skipping purchase migration.');
    return;
  }

  const [manual] = await tx
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.category, 'purchase'),
        eq(ledgerEntries.sourceKind, 'manual'),
        eq(ledgerEntries.description, 'PO-001'),
      ),
    )
    .limit(1);
  if (!manual) {
    console.log('  No manual PO-001 payment found — skipping.');
    return;
  }

  const [existingPayment] = await tx
    .select({ id: purchaseOrderPayments.id })
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.purchaseOrderId, order.id))
    .limit(1);
  if (existingPayment) {
    console.log('  PO-001 already has a payment row — skipping legacy migration.');
    return;
  }

  const memberId = actorId(manual.createdById, manual.memberId, order.createdById);
  const [payment] = await tx
    .insert(purchaseOrderPayments)
    .values({
      purchaseOrderId: order.id,
      amountCents: manual.amountCents,
      currency: manual.currency,
      fxRateMicros: manual.fxRateMicros,
      method: manual.paymentMethod,
      paidAt: manual.occurredAt,
      notes: 'Migrated from the legacy PO-001 manual ledger entry.',
      memberId,
      createdById: memberId,
    })
    .returning();
  if (!payment) throw new Error('Could not create the PO-001 payment row.');

  await postLedgerEntry(tx, {
    direction: 'out',
    category: 'purchase',
    description: 'PO-001 · payment',
    currency: manual.currency,
    rateMicros: manual.fxRateMicros,
    amountCents: manual.amountCents,
    paymentMethod: manual.paymentMethod,
    occurredAt: manual.occurredAt,
    memberId,
    sourceKind: 'purchase_order',
    sourceId: payment.id,
    notes: 'Reconciliation — migrated from the legacy manual ledger entry.',
  });
  await reverseEntry(
    tx,
    manual,
    'Reversal of legacy PO-001 manual payment',
    'Reconciliation — replaced by a purchase-order payment row.',
    memberId,
  );

  const [landed] = await tx.execute<{ landed: string }>(sql`
    SELECT COALESCE(SUM(landed_cost_cents), 0)::text AS landed
      FROM purchase_order_items
     WHERE purchase_order_id = ${order.id}
  `);
  console.log(
    `  Migrated PO-001 payment; landed cost is $${(Number(landed?.landed ?? 0) / 100).toFixed(2)} and the recorded payment remains ${manual.currency} ${(manual.amountCents / 100).toFixed(2)}.`,
  );
}

async function main() {
  if (process.env.RECONCILE_POSTINGS_CONFIRM !== 'yes') {
    throw new Error(
      'Refusing to reconcile without RECONCILE_POSTINGS_CONFIRM=yes. Verify the bank records first.',
    );
  }

  console.log('Starting reconciliation…');

  await db.transaction(async (tx) => {
    await reconcileLegacySalesLump(tx);
    await reconcileSales(tx);
    await reconcileLegacyPurchase(tx);
  });

  console.log('Reconciliation complete. Run the production verification queries before opening the app.');
}

main().catch((error) => {
  console.error('Reconciliation failed:', error);
  process.exit(1);
});
