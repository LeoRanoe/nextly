/**
 * Money primitives.
 *
 * Every monetary amount in Nextly is an INTEGER number of minor units
 * (USD cents, SRD cents). Floats never touch the books. See
 * docs/adr/0001-money-as-integer-minor-units.md.
 *
 * We use `number` rather than `bigint` in the app layer: JS integers are exact
 * to 2^53, which is ~$90 trillion in cents. The database column is `bigint`;
 * Drizzle maps it back with `mode: 'number'`. Intermediate products that could
 * exceed 2^53 go through BigInt inside `mulDivRound`.
 */

export type Cents = number;
export type CurrencyCode = 'USD' | 'SRD';

export const CURRENCIES: Record<
  CurrencyCode,
  { decimals: number; symbol: string; label: string }
> = {
  USD: { decimals: 2, symbol: '$', label: 'US Dollar' },
  SRD: { decimals: 2, symbol: 'SRD', label: 'Surinamese Dollar' },
};

/** Multiply then divide in one step, rounding half away from zero, without
 *  ever losing precision to floating point. Used for every proportional
 *  split in the system: FX, weighted-average cost, overhead allocation. */
export function mulDivRound(value: number, numerator: number, denominator: number): number {
  if (!Number.isInteger(value) || !Number.isInteger(numerator)) {
    throw new TypeError('mulDivRound expects integer value and numerator');
  }
  if (denominator === 0) throw new RangeError('mulDivRound: division by zero');

  const negative = (value < 0 !== numerator < 0) !== denominator < 0;
  const a = BigInt(Math.abs(value));
  const b = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));

  const product = a * b;
  const quotient = product / d;
  const remainder = product % d;

  // Round half away from zero — the commercial convention. Banker's rounding
  // would be wrong here: it biases individual invoices to look "off by one".
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  const result = Number(rounded);

  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`mulDivRound overflowed the safe integer range: ${rounded}`);
  }
  return negative ? -result : result;
}

/**
 * Parse a human-entered decimal string into minor units, exactly.
 * `"29.548"` at 2 decimals → `2955`. Never routes through parseFloat.
 */
export function parseMoney(input: string | number, currency: CurrencyCode = 'USD'): Cents {
  const { decimals } = CURRENCIES[currency];
  const raw = String(input)
    .trim()
    .replace(/[\s,_]/g, '');
  if (raw === '' || raw === '-' || raw === '+') return 0;

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) throw new TypeError(`Not a valid money amount: ${JSON.stringify(input)}`);

  const [, sign, whole = '', fraction = ''] = match;
  const padded = fraction.padEnd(decimals + 1, '0');
  const kept = padded.slice(0, decimals);
  const nextDigit = Number(padded[decimals] ?? '0');

  const magnitude = Number(`${whole || '0'}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError(`Money amount out of range: ${input}`);
  }
  return sign === '-' ? -magnitude : magnitude;
}

/** Minor units → a plain decimal string, e.g. `2955` → `"29.55"`. */
export function toDecimalString(cents: Cents, currency: CurrencyCode = 'USD'): string {
  const { decimals } = CURRENCIES[currency];
  const negative = cents < 0;
  const digits = String(Math.abs(cents)).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);
  return `${negative ? '-' : ''}${whole}${decimals > 0 ? `.${fraction}` : ''}`;
}

export type FormatMoneyOptions = {
  /** Drop the currency symbol — for table cells that carry a column header. */
  bare?: boolean;
  /** Round to whole units. Used in compact chart axes only, never in tables. */
  whole?: boolean;
  /** Always show a leading + on positive values (ledger deltas). */
  signed?: boolean;
};

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: Cents,
  currency: CurrencyCode = 'USD',
  options: FormatMoneyOptions = {},
): string {
  const { decimals } = CURRENCIES[currency];
  const fractionDigits = options.whole ? 0 : decimals;
  const key = `${currency}:${fractionDigits}:${options.bare ? 'bare' : 'sym'}`;

  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: options.bare ? 'decimal' : 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, formatter);
  }

  const units = cents / 10 ** decimals;
  const text = formatter.format(options.whole ? Math.round(units) : units);
  return options.signed && cents > 0 ? `+${text}` : text;
}

/** Compact form for chart axes and dense KPI strips: $1.2k, $3.4M. */
export function formatCompact(cents: Cents, currency: CurrencyCode = 'USD'): string {
  const { decimals, symbol } = CURRENCIES[currency];
  const units = cents / 10 ** decimals;
  const abs = Math.abs(units);
  const sign = units < 0 ? '-' : '';
  const prefix = currency === 'USD' ? symbol : '';

  if (abs < 1000) return `${sign}${prefix}${abs.toFixed(0)}`;
  if (abs < 1_000_000) return `${sign}${prefix}${(abs / 1000).toFixed(abs < 10_000 ? 1 : 0)}k`;
  return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`;
}

/** Percent from two integer amounts, as a 0–1 ratio. Guards divide-by-zero. */
export function ratio(part: Cents, whole: Cents): number {
  if (whole === 0) return 0;
  return part / whole;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce<number>((total, value) => total + value, 0);
}
