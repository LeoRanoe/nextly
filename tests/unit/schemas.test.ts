import { describe, expect, it } from 'vitest';
import { dateInput, moneyInput, saleRefundSchema } from '@/lib/schemas';

describe('dateInput', () => {
  it('rejects dates that JavaScript would silently normalise', () => {
    expect(dateInput.safeParse('2026-02-31').success).toBe(false);
  });

  it('accepts a real ISO calendar date', () => {
    const result = dateInput.safeParse('2026-02-28');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('money validation', () => {
  it('rejects negative values instead of passing a signed amount downstream', () => {
    expect(moneyInput.safeParse('-1.00').success).toBe(false);
  });

  it('rejects a zero refund because refunds must move a positive amount', () => {
    expect(
      saleRefundSchema.safeParse({
        saleId: '00000000-0000-4000-8000-000000000000',
        amountCents: '0',
        paymentMethod: 'cash',
        reason: 'Customer credit',
      }).success,
    ).toBe(false);
  });
});
