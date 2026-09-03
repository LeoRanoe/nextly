import { describe, expect, it } from 'vitest';
import { periodRange } from '@/lib/report-period';

describe('report period ranges', () => {
  it('keeps the all-time range bounded by a valid next-day date', () => {
    const range = periodRange('all', new Date('2026-09-03T12:34:56.000Z'));

    expect(range.from.toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-04T00:00:00.000Z');

    const previousFrom = new Date(
      range.from.getTime() - (range.to.getTime() - range.from.getTime()),
    );
    expect(previousFrom.toISOString()).toBe('1973-04-29T00:00:00.000Z');
  });
});
