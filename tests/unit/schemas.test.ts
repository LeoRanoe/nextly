import { afterEach, describe, expect, it } from 'vitest';
import { isMigrationEnvironmentValid, isServerEnvironmentValid } from '@/lib/env';
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

describe('runtime environment validation', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDirectUrl = process.env.DIRECT_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = originalDirectUrl;
  });

  it('accepts the required Supabase pooler format', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
    expect(isServerEnvironmentValid()).toBe(true);
  });

  it('rejects a direct or malformed runtime connection', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres';
    expect(isServerEnvironmentValid()).toBe(false);
    process.env.DATABASE_URL = 'not-a-database-url';
    expect(isServerEnvironmentValid()).toBe(false);
  });

  it('keeps runtime readiness independent from the migration-only direct URL', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
    process.env.DIRECT_URL =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres';

    expect(isServerEnvironmentValid()).toBe(true);
    expect(isMigrationEnvironmentValid()).toBe(false);
  });
});
