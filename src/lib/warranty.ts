/**
 * Warranty expiry, derived (F-6).
 *
 * Never stored: the product's term can be corrected tomorrow without silently
 * rewriting what was promised on the day of sale — and a stored date would go
 * stale against every serial already sold. Expiry is computed from `soldAt`
 * plus the product's `warrantyMonths` wherever it is needed.
 */

/** Add whole months to a date, clamping to the last day of the target month
 *  (31 Jan + 1 month = 28 Feb, not 3 Mar). */
export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

/** The moment cover lapses, or null when the product carries no warranty. */
export function warrantyExpiresAt(soldAt: string | Date, warrantyMonths: number): Date | null {
  if (warrantyMonths <= 0) return null;
  const sold = typeof soldAt === 'string' ? new Date(soldAt) : soldAt;
  if (Number.isNaN(sold.getTime())) return null;
  return addMonthsClamped(sold, warrantyMonths);
}

export type WarrantyState = 'covered' | 'expiring' | 'expired' | 'none';

/** "Expiring" means within 30 days — long enough to act on, short enough that
 *  an owner scanning the list will not mistake it for settled. `null` here
 *  means "the product carries no warranty", which is not the same failure as
 *  "cover lapsed" and must not wear its badge. */
export function warrantyState(expiresAt: Date | null, now: Date = new Date()): WarrantyState {
  if (!expiresAt) return 'none';
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 'expired';
  if (ms <= 30 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'covered';
}
