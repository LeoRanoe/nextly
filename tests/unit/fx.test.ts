import { describe, expect, it } from 'vitest';
import { formatRate, fromBase, isRateStale, normaliseToUsd, parseRate, toBase } from '@/lib/fx';
import { parseMoney } from '@/lib/money';

describe('parseRate', () => {
  it('scales to micro-units exactly', () => {
    expect(parseRate('38.5')).toBe(38_500_000);
    expect(parseRate(38.5)).toBe(38_500_000);
    expect(parseRate('1')).toBe(1_000_000);
  });

  it('rejects zero and nonsense', () => {
    expect(() => parseRate('0')).toThrow(RangeError);
    expect(() => parseRate('abc')).toThrow(TypeError);
  });
});

describe('conversion at the sheet rate of 38.5 SRD per USD', () => {
  const rate = parseRate('38.5');

  it('matches the sheet: 55.00 USD sells for 2117.50 SRD', () => {
    expect(fromBase(parseMoney('55.00'), rate)).toBe(parseMoney('2117.50'));
    expect(toBase(parseMoney('2117.50'), rate)).toBe(parseMoney('55.00'));
  });

  it('matches the sheet: 64.04 USD profit is 2465.54 SRD', () => {
    expect(fromBase(parseMoney('64.04'), rate)).toBe(parseMoney('2465.54'));
  });

  it('never rounds an amount already in the base currency', () => {
    const odd = parseMoney('0.01');
    expect(normaliseToUsd(odd, 'USD', rate)).toBe(odd);
  });

  it('normalises SRD through the recorded rate', () => {
    expect(normaliseToUsd(parseMoney('3850.00'), 'SRD', rate)).toBe(parseMoney('100.00'));
  });

  it('formats for display', () => {
    expect(formatRate(38_500_000)).toBe('38.5000');
  });
});

describe('isRateStale', () => {
  const now = new Date('2026-09-01T00:00:00Z');

  it('flags a rate older than a week', () => {
    expect(isRateStale(new Date('2026-08-20T00:00:00Z'), now)).toBe(true);
    expect(isRateStale(new Date('2026-08-29T00:00:00Z'), now)).toBe(false);
  });
});
