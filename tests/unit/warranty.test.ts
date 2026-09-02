import { describe, expect, it } from 'vitest';
import { addMonthsClamped, warrantyExpiresAt, warrantyState } from '@/lib/warranty';

const DAY = 24 * 60 * 60 * 1000;

describe('addMonthsClamped', () => {
  it('clamps to the last day of a shorter target month', () => {
    // 31 Jan + 1 month = 28 Feb, not 3 Mar.
    expect(addMonthsClamped(new Date(Date.UTC(2026, 0, 31)), 1)).toEqual(
      new Date(Date.UTC(2026, 1, 28)),
    );
  });

  it('respects leap years', () => {
    expect(addMonthsClamped(new Date(Date.UTC(2024, 0, 31)), 1)).toEqual(
      new Date(Date.UTC(2024, 1, 29)),
    );
  });

  it('keeps the day when it fits', () => {
    expect(addMonthsClamped(new Date(Date.UTC(2026, 4, 15)), 6)).toEqual(
      new Date(Date.UTC(2026, 10, 15)),
    );
  });

  it('rolls the year over', () => {
    expect(addMonthsClamped(new Date(Date.UTC(2026, 11, 31)), 13)).toEqual(
      new Date(Date.UTC(2028, 0, 31)),
    );
  });

  it('returns the same date for zero months', () => {
    const date = new Date(Date.UTC(2026, 2, 7));
    expect(addMonthsClamped(date, 0)).toEqual(date);
  });
});

describe('warrantyExpiresAt', () => {
  it('is null when the product carries no warranty', () => {
    expect(warrantyExpiresAt(new Date(Date.UTC(2026, 0, 15)), 0)).toBeNull();
    expect(warrantyExpiresAt(new Date(Date.UTC(2026, 0, 15)), -3)).toBeNull();
  });

  it('accepts ISO strings and adds whole months', () => {
    expect(warrantyExpiresAt('2026-01-15T09:30:00.000Z', 12)).toEqual(
      new Date(Date.UTC(2027, 0, 15)),
    );
  });

  it('is null for unparseable input rather than throwing', () => {
    expect(warrantyExpiresAt('not a date', 12)).toBeNull();
  });
});

describe('warrantyState', () => {
  const now = new Date(Date.UTC(2026, 5, 15));

  it('distinguishes "no warranty" from "expired"', () => {
    expect(warrantyState(null, now)).toBe('none');
  });

  it('marks past expiry as expired, boundary included', () => {
    expect(warrantyState(new Date(now.getTime() - 1), now)).toBe('expired');
    expect(warrantyState(new Date(now.getTime()), now)).toBe('expired');
  });

  it('marks the 30-day window as expiring', () => {
    expect(warrantyState(new Date(now.getTime() + 30 * DAY), now)).toBe('expiring');
    expect(warrantyState(new Date(now.getTime() + 31 * DAY), now)).toBe('covered');
  });
});
