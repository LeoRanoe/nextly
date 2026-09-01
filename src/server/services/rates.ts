import { sql } from 'drizzle-orm';
import { RATE_SCALE, type RateMicros } from '@/lib/fx';
import { db } from '../db/client';
import type { Tx } from './posting';

/**
 * Resolving the rate to record on a transaction.
 *
 * A transaction dated last month must be converted at last month's rate, not
 * today's. That is the entire reason `fx_rates` is a dated series rather than a
 * setting, and this is the only place that lookup happens.
 */

/** The rate in force on a given date. Falls back to the earliest known rate if
 *  the transaction predates the series, which is better than silently using 1. */
export async function rateOn(date: Date, tx?: Tx): Promise<RateMicros> {
  const client = tx ?? db;

  const rows = await client.execute<{ rate_micros: string }>(sql`
    SELECT rate_micros::text
      FROM fx_rates
     WHERE base = 'USD' AND quote = 'SRD' AND effective_from <= ${date}
     ORDER BY effective_from DESC
     LIMIT 1
  `);

  const found = rows[0]?.rate_micros;
  if (found) return Number(found);

  const earliest = await client.execute<{ rate_micros: string }>(sql`
    SELECT rate_micros::text
      FROM fx_rates
     WHERE base = 'USD' AND quote = 'SRD'
     ORDER BY effective_from ASC
     LIMIT 1
  `);

  const fallback = earliest[0]?.rate_micros;
  if (fallback) return Number(fallback);

  throw new Error(
    'No exchange rate has been set. Add one in Settings before recording SRD amounts.',
  );
}

/**
 * The rate to store on a USD-only transaction.
 *
 * Still recorded, because the SRD display value of a past USD amount should be
 * reproducible later without guessing which rate applied.
 */
export async function rateForRecord(date: Date, tx?: Tx): Promise<RateMicros> {
  try {
    return await rateOn(date, tx);
  } catch {
    // A USD-only business with no rate configured is workable; SRD entry is
    // what genuinely needs one, and that path calls rateOn directly.
    return RATE_SCALE;
  }
}
