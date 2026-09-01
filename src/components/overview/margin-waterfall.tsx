import { cn } from '@/lib/cn';
import { formatCompact, formatMoney } from '@/lib/money';
import { type PeriodPreset, periodRange } from '@/lib/report-period';
import { getWaterfall } from '@/server/queries/overview';

/**
 * Revenue to net, as a waterfall.
 *
 * This is the chart that actually explains the business: it shows the cost of
 * goods and the running costs as things that take a bite out of revenue,
 * rather than as three numbers sitting in separate boxes for the reader to
 * subtract in their head.
 *
 * Server-rendered SVG. A waterfall has no interaction worth shipping a
 * charting runtime for.
 */

type Step = {
  label: string;
  /** Signed contribution, or null for a subtotal that just lands where it is. */
  delta: number | null;
  value: number;
  kind: 'positive' | 'negative' | 'subtotal' | 'total';
};

export async function MarginWaterfall({ preset = 'all' }: { preset?: PeriodPreset }) {
  const { revenueCents, cogsCents, grossCents, expensesCents, netCents } = await getWaterfall(
    periodRange(preset),
  );

  const steps: Step[] = [
    { label: 'Revenue', delta: revenueCents, value: revenueCents, kind: 'positive' },
    { label: 'Cost of goods', delta: -cogsCents, value: grossCents, kind: 'negative' },
    { label: 'Gross profit', delta: null, value: grossCents, kind: 'subtotal' },
    { label: 'Operating costs', delta: -expensesCents, value: netCents, kind: 'negative' },
    { label: 'Net result', delta: null, value: netCents, kind: 'total' },
  ];

  const ceiling = Math.max(revenueCents, grossCents, netCents, 1);
  const floor = Math.min(0, netCents, grossCents);
  const span = ceiling - floor || 1;

  if (revenueCents === 0 && expensesCents === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-ink-4">
        No confirmed sales or expenses yet. This is where revenue, cost of goods and running
        costs will resolve into a net result.
      </p>
    );
  }

  return (
    <div className="p-4">
      <div className="flex h-[168px] items-stretch gap-2">
        {steps.map((step) => {
          const start = step.delta === null ? floor : step.value - step.delta;
          const lower = Math.min(start, step.value);
          const upper = Math.max(start, step.value);

          const bottomPct = ((lower - floor) / span) * 100;
          const heightPct = Math.max(((upper - lower) / span) * 100, 0.8);

          return (
            <div key={step.label} className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1">
                <div
                  className={cn(
                    'absolute right-0 left-0 rounded-row',
                    step.kind === 'positive' && 'bg-chart-2',
                    step.kind === 'negative' && 'bg-negative/70',
                    step.kind === 'subtotal' && 'bg-chart-3',
                    step.kind === 'total' && (step.value >= 0 ? 'bg-chart-4' : 'bg-negative'),
                  )}
                  style={{ bottom: `${bottomPct}%`, height: `${heightPct}%` }}
                />
              </div>
              <p className="tabular mt-2 truncate text-center text-[11px] text-ink-2">
                {formatCompact(step.delta === null ? step.value : step.delta)}
              </p>
              <p className="mt-0.5 truncate text-center text-[10px] text-ink-4 leading-tight">
                {step.label}
              </p>
            </div>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-line-subtle border-t pt-3">
        <Row label="Gross margin" value={rate(grossCents, revenueCents)} />
        <Row label="Net margin" value={rate(netCents, revenueCents)} />
        <Row label="Gross profit" value={formatMoney(grossCents)} />
        <Row
          label="Net result"
          value={formatMoney(netCents)}
          tone={netCents >= 0 ? 'positive' : 'negative'}
        />
      </dl>
    </div>
  );
}

function rate(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-[12px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'tabular text-[12px]',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          !tone && 'text-ink-2',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
