/**
 * Report period presets, shared between the client selector
 * (`components/reports/period-selector.tsx`) and the server page that
 * resolves a preset into actual dates. Kept here rather than duplicated in
 * both, since "what does 'this month' mean" is exactly the kind of thing
 * that quietly drifts if it is computed twice.
 */

export type PeriodPreset = 'month' | 'lastmonth' | 'last90' | 'year' | 'all';

export const PERIOD_PRESETS: Record<PeriodPreset, string> = {
  month: 'This month',
  lastmonth: 'Last month',
  last90: 'Last 90 days',
  year: 'This year',
  all: 'All time',
};

export function isPeriodPreset(value: string | undefined): value is PeriodPreset {
  return value !== undefined && value in PERIOD_PRESETS;
}

/** UTC midnight boundaries, so "this month" means the same thing regardless
 *  of who is looking at it — the same reasoning `lib/schemas.ts`'s
 *  `dateInput` uses for a typed date. */
export function periodRange(
  preset: PeriodPreset,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  switch (preset) {
    case 'month':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to };
    case 'lastmonth': {
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return {
        from: lastMonth,
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      };
    }
    case 'last90':
      return { from: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000), to };
    case 'year':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to };
    case 'all':
      // Keep the upper bound at the same safe, next-day boundary as every
      // other preset. A year-9999 sentinel makes the P&L comparison window
      // subtract thousands of years and serialize an invalid PostgreSQL date.
      return { from: new Date(Date.UTC(2000, 0, 1)), to };
  }
}
