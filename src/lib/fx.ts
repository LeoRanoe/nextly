/**
 * Foreign exchange.
 *
 * USD is the base currency; the books are kept in USD cents. SRD is a
 * quotation. Rates are stored as integer MICRO-UNITS (rate x 1_000_000) so
 * conversion is exact integer arithmetic — 38.5 SRD/USD is `38_500_000`.
 *
 * The rate that applied at the moment of a transaction is written onto that
 * transaction row. Editing today's rate must never re-value last month's
 * sales, which is exactly what the spreadsheet does today.
 */

import { type Cents, type CurrencyCode, mulDivRound } from './money';

export const RATE_SCALE = 1_000_000;

export type RateMicros = number;

export function parseRate(input: string | number): RateMicros {
  const raw = String(input)
    .trim()
    .replace(/[\s,_]/g, '');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) throw new TypeError(`Not a valid exchange rate: ${JSON.stringify(input)}`);

  const [, whole = '', fraction = ''] = match;
  const padded = fraction.padEnd(7, '0');
  const kept = padded.slice(0, 6);
  const nextDigit = Number(padded[6] ?? '0');

  const micros = Number(`${whole || '0'}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new RangeError(`Exchange rate out of range: ${input}`);
  }
  return micros;
}

export function formatRate(micros: RateMicros, digits = 4): string {
  return (micros / RATE_SCALE).toFixed(digits);
}

/** Quote currency (SRD) minor units → base currency (USD) minor units. */
export function toBase(amount: Cents, rate: RateMicros): Cents {
  return mulDivRound(amount, RATE_SCALE, rate);
}

/** Base currency (USD) minor units → quote currency (SRD) minor units. */
export function fromBase(amount: Cents, rate: RateMicros): Cents {
  return mulDivRound(amount, rate, RATE_SCALE);
}

/**
 * Normalise any transaction amount into USD cents using the rate recorded on
 * that transaction. A USD amount passes through untouched — we never round a
 * value that is already in the base currency.
 */
export function normaliseToUsd(amount: Cents, currency: CurrencyCode, rate: RateMicros): Cents {
  return currency === 'USD' ? amount : toBase(amount, rate);
}

/** True when a rate is old enough that the dashboard should warn about it. */
export function isRateStale(
  effectiveFrom: Date,
  now: Date = new Date(),
  maxAgeDays = 7,
): boolean {
  const ageMs = now.getTime() - effectiveFrom.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
