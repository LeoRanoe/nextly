import { Money, Percent } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { type PeriodPreset, periodRange } from '@/lib/report-period';
import { getProfitAndLoss } from '@/server/queries/reports';

/**
 * Revenue to net, over the selected period, with the immediately preceding
 * window of equal length as a comparison column — a P&L without a
 * comparison is a number without a scale.
 */
export async function ProfitAndLossReport({ preset }: { preset: PeriodPreset }) {
  const { from, to } = periodRange(preset);
  const report = await getProfitAndLoss({ from, to });

  if (report.revenueCents === 0 && report.expensesCents === 0) {
    return (
      <Surface>
        <SurfaceHeader
          title="Profit and loss"
          hint="Revenue to net, over the selected period"
        />
        <p className="px-4 py-10 text-center text-[13px] text-ink-4">
          No confirmed sales or expenses in this period.
        </p>
      </Surface>
    );
  }

  const change = (current: number, previous: number): number | null => {
    if (previous === 0) return current === 0 ? 0 : null;
    return (current - previous) / Math.abs(previous);
  };

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader title="Profit and loss" hint="Revenue to net, over the selected period" />
      <div className="p-4">
        <dl className="divide-y divide-line-subtle">
          <Row
            label="Revenue"
            value={report.revenueCents}
            change={change(report.revenueCents, report.previous.revenueCents)}
          />
          <Row
            label="Cost of goods"
            value={-report.cogsCents}
            change={change(report.cogsCents, report.previous.cogsCents)}
            muted
          />
          <Row
            label="Gross profit"
            value={report.grossCents}
            change={change(report.grossCents, report.previous.grossCents)}
            strong
          />
          <Row
            label="Operating expenses"
            value={-report.expensesCents}
            change={change(report.expensesCents, report.previous.expensesCents)}
            muted
          />
          <Row
            label="Net result"
            value={report.netCents}
            change={change(report.netCents, report.previous.netCents)}
            strong
          />
        </dl>

        {report.expensesByCategory.length > 0 ? (
          <div className="mt-4 border-line-subtle border-t pt-3">
            <p className="mb-2 text-[11px] text-ink-4 uppercase tracking-[0.06em]">
              Expenses by category
            </p>
            <dl className="space-y-1.5">
              {report.expensesByCategory.map((entry) => (
                <div key={entry.name} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-ink-3">{entry.name}</dt>
                  <dd>
                    <Money cents={entry.amountCents} size="sm" tone="muted" />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

function Row({
  label,
  value,
  change,
  muted,
  strong,
}: {
  label: string;
  value: number;
  change: number | null;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <dt className={cn('text-[13px]', strong ? 'text-ink' : 'text-ink-3')}>{label}</dt>
      <dd className="flex items-baseline gap-2.5">
        {change !== null ? (
          <Percent
            value={change}
            digits={0}
            tone="flow"
            className="tabular text-[11px] text-ink-4"
          />
        ) : null}
        <Money cents={value} size={strong ? 'md' : 'sm'} tone={muted ? 'muted' : 'default'} />
      </dd>
    </div>
  );
}
