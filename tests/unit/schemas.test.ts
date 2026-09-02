import { describe, expect, it } from 'vitest';
import { dateInput } from '@/lib/schemas';

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
