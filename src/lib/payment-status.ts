/**
 * How much of a sale's payable amount has actually been received (F-4).
 *
 * One place decides what *Paid · Partly paid · Unpaid · Overdue* means, so the
 * sales list, the sale page, the customer page and the Overview cannot drift
 * into disagreeing about who owes money — the exact failure mode the ledger
 * section of this codebase exists to prevent.
 *
 * Nothing here is stored. `totalCents` is what is payable in the currency of
 * the sale; `paidCents` is the sum of its `sale_payments` rows in that same
 * currency. A void or draft sale is not owed: it either posted nothing or had
 * its postings removed.
 */

export type PaymentStatusCode = 'paid' | 'partly' | 'unpaid';
export type PaymentBadgeCode = PaymentStatusCode | 'overdue';

/** A confirmed sale with money still outstanding is overdue after this long.
 *  There is no due-date column on purpose — nothing in the business promises
 *  terms — so the clock starts at the sale itself. */
export const OVERDUE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

export function paymentStatusOf(totalCents: number, paidCents: number): PaymentStatusCode {
  if (paidCents >= totalCents) return 'paid';
  return paidCents > 0 ? 'partly' : 'unpaid';
}

export function balanceCentsOf(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}

/** Overdue is a property of an unpaid balance with age, never of a settled one. */
export function paymentBadgeOf(
  totalCents: number,
  paidCents: number,
  soldAt: Date,
  now: Date = new Date(),
): PaymentBadgeCode {
  const status = paymentStatusOf(totalCents, paidCents);
  if (status === 'paid') return 'paid';
  if (now.getTime() - soldAt.getTime() > OVERDUE_AFTER_DAYS * DAY_MS) return 'overdue';
  return status;
}

export const PAYMENT_LABELS: Record<PaymentBadgeCode, string> = {
  paid: 'Paid',
  partly: 'Partly paid',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
};
