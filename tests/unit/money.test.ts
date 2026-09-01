import { describe, expect, it } from 'vitest';
import {
  formatCompact,
  formatMoney,
  mulDivRound,
  parseMoney,
  toDecimalString,
} from '@/lib/money';

describe('parseMoney', () => {
  it('parses decimals exactly, without floating point drift', () => {
    expect(parseMoney('38.99')).toBe(3899);
    expect(parseMoney('23.394')).toBe(2339); // 23.394 → 2339.4 → 2339
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('1234567.89')).toBe(123456789);
  });

  it('rounds the discarded digit half-up', () => {
    expect(parseMoney('29.548')).toBe(2955);
    expect(parseMoney('29.544')).toBe(2954);
    expect(parseMoney('0.005')).toBe(1);
  });

  it('handles signs, blanks and thousands separators', () => {
    expect(parseMoney('-40')).toBe(-4000);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('1,234.50')).toBe(123450);
    expect(parseMoney(220)).toBe(22000);
  });

  it('survives the classic 0.1 + 0.2 float trap', () => {
    expect(parseMoney('0.1') + parseMoney('0.2')).toBe(parseMoney('0.3'));
  });

  it('rejects nonsense', () => {
    expect(() => parseMoney('abc')).toThrow(TypeError);
    expect(() => parseMoney('1.2.3')).toThrow(TypeError);
  });
});

describe('toDecimalString', () => {
  it('round-trips through parseMoney', () => {
    for (const value of ['0.00', '29.55', '147.74', '-40.00', '1234567.89']) {
      expect(toDecimalString(parseMoney(value))).toBe(value);
    }
  });

  it('pads sub-unit amounts', () => {
    expect(toDecimalString(5)).toBe('0.05');
    expect(toDecimalString(-5)).toBe('-0.05');
  });
});

describe('mulDivRound', () => {
  it('rounds half away from zero', () => {
    expect(mulDivRound(10, 1, 4)).toBe(3); // 2.5 → 3
    expect(mulDivRound(-10, 1, 4)).toBe(-3); // -2.5 → -3
    expect(mulDivRound(10, 1, 3)).toBe(3); // 3.33 → 3
  });

  it('stays exact past 2^53 in the intermediate product', () => {
    // 9e15 * 7 overflows a double, but the BigInt path keeps it exact.
    expect(mulDivRound(9_000_000_000_000_000, 7, 7)).toBe(9_000_000_000_000_000);
  });

  it('refuses division by zero', () => {
    expect(() => mulDivRound(100, 1, 0)).toThrow(RangeError);
  });
});

describe('formatting', () => {
  it('formats money for tables', () => {
    expect(formatMoney(10181)).toBe('$101.81');
    expect(formatMoney(10181, 'USD', { bare: true })).toBe('101.81');
    expect(formatMoney(10181, 'USD', { signed: true })).toBe('+$101.81');
    expect(formatMoney(-4000, 'USD')).toBe('-$40.00');
  });

  it('compacts for chart axes', () => {
    // One decimal below 10k, none above: $1.2k, $9.9k, $12k, $250k.
    expect(formatCompact(22000)).toBe('$220');
    expect(formatCompact(123_450)).toBe('$1.2k');
    expect(formatCompact(1_234_500)).toBe('$12k');
    expect(formatCompact(-1_234_500)).toBe('-$12k');
    expect(formatCompact(500_000_000)).toBe('$5.0M');
  });
});
