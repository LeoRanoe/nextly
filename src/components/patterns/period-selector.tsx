'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { Select } from '@/components/ui/field';
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/report-period';

/** Bound to `?period=`; the server page resolves the preset into actual
 *  dates via `lib/report-period.ts`'s `periodRange`. The default must match
 *  the server page's own fallback, or the control shows one period while
 *  the figures are computed for another. */
export function PeriodSelector({ defaultValue = 'all' }: { defaultValue?: PeriodPreset }) {
  const [period, setPeriod] = useQueryState(
    'period',
    parseAsString.withDefault(defaultValue).withOptions({ shallow: false, history: 'replace' }),
  );

  return (
    <Select
      aria-label="Period"
      value={period}
      onChange={(event) => setPeriod(event.target.value)}
      className="h-8 w-auto text-[12px]"
    >
      {Object.entries(PERIOD_PRESETS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}
