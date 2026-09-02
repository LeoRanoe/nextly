import { describe, expect, it } from 'vitest';
import {
  balanceCentsOf,
  OVERDUE_AFTER_DAYS,
  paymentBadgeOf,
  paymentStatusOf,
} from '@/lib/payment-status';

const DAY_MS = 86_400_000;

describe('paymentStatusOf', () => {
  it('is paid when the payments exactly cover the total', () => {
    expect(paymentStatusOf(10_000, 10_000)).toBe('paid');
  });

  it('is paid on overpayment — money in is never a shortfall', () => {
    expect(paymentStatusOf(10_000, 12_500)).toBe('paid');
  });

  it('is partly paid between zero and the total', () => {
    expect(paymentStatusOf(10_000, 1)).toBe('partly');
    expect(paymentStatusOf(10_000, 9_999)).toBe('partly');
  });

  it('is unpaid with nothing received', () => {
    expect(paymentStatusOf(10_000, 0)).toBe('unpaid');
  });

  it('treats a zero-total sale as paid — there is nothing to collect', () => {
    expect(paymentStatusOf(0, 0)).toBe('paid');
  });
});

describe('balanceCentsOf', () => {
  it('returns what is left to collect', () => {
    expect(balanceCentsOf(10_000, 3_500)).toBe(6_500);
  });

  it('never goes negative for an overpaid sale', () => {
    expect(balanceCentsOf(10_000, 14_000)).toBe(0);
  });
});

describe('paymentBadgeOf', () => {
  const soldAt = new Date('2026-01-15T12:00:00Z');

  it('short-circuits to paid no matter how old the sale is', () => {
    const yearsLater = new Date(soldAt.getTime() + 400 * 365 * DAY_MS);
    expect(paymentBadgeOf(10_000, 10_000, soldAt, yearsLater)).toBe('paid');
    // An overpaid ancient sale is still just paid.
    expect(paymentBadgeOf(10_000, 12_000, soldAt, yearsLater)).toBe('paid');
  });

  it('keeps young unpaid balances at their plain status', () => {
    const dayLater = new Date(soldAt.getTime() + DAY_MS);
    expect(paymentBadgeOf(10_000, 0, soldAt, dayLater)).toBe('unpaid');
    expect(paymentBadgeOf(10_000, 4_000, soldAt, dayLater)).toBe('partly');
  });

  it('escalates to overdue only strictly past the threshold', () => {
    const exactly = new Date(soldAt.getTime() + OVERDUE_AFTER_DAYS * DAY_MS);
    expect(paymentBadgeOf(10_000, 0, soldAt, exactly)).toBe('unpaid');

    const oneMsOn = new Date(soldAt.getTime() + OVERDUE_AFTER_DAYS * DAY_MS + 1);
    expect(paymentBadgeOf(10_000, 0, soldAt, oneMsOn)).toBe('overdue');
  });

  it('escalates partly-paid balances too — some money in does not stop the clock', () => {
    const longAgo = new Date(soldAt.getTime() + (OVERDUE_AFTER_DAYS + 1) * DAY_MS);
    expect(paymentBadgeOf(10_000, 9_000, soldAt, longAgo)).toBe('overdue');
  });
});
