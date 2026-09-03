import { Package } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { EmptyState } from '@/components/patterns/empty-state';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { formatMoney } from '@/lib/money';
import { REORDER_TIME_ZONE, startOfReorderWeek } from '@/lib/reorder';
import { getLatestReorderSnapshot, getReorderRecommendations } from '@/server/queries/reorder';

/**
 * A compact decision surface for the overview. The review page remains the
 * place where quantities are changed, but the dashboard should answer the
 * morning question: what needs attention before the next supplier order?
 */
export async function InventoryDecisions() {
  await connection();
  const [rows, latestSnapshot] = await Promise.all([
    getReorderRecommendations(),
    getLatestReorderSnapshot(),
  ]);
  const actionable = rows.filter((row) => row.recommendedQty > 0);
  const top = actionable.slice(0, 4);
  const lowConfidence = actionable.filter((row) =>
    row.reasons.some((reason) => reason.startsWith('Low confidence')),
  ).length;
  const stockoutRisk = actionable.filter((row) => row.reasons.includes('Stockout risk')).length;
  const missingWeights = actionable.filter((row) => (row.weightGrams ?? 0) <= 0).length;
  const fullCostCents = actionable.reduce(
    (total, row) => total + row.recommendedQty * row.landedUnitCostCents,
    0,
  );
  const budgetCostCents = actionable.reduce(
    (total, row) => total + row.budgetQty * row.landedUnitCostCents,
    0,
  );
  const nextRun = new Date(startOfReorderWeek().getTime() + 7 * 24 * 60 * 60 * 1000);

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Package}
        title="No purchasing signal yet"
        description="Record a few confirmed sales and the weekly review will surface what to reorder."
        action={
          <Link href="/reorder" className="text-accent underline-offset-4 hover:underline">
            Open reorder advice
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-line-subtle sm:grid-cols-4">
        <Metric label="To review" value={actionable.length} />
        <Metric
          label="At stockout risk"
          value={stockoutRisk}
          tone={stockoutRisk ? 'warning' : undefined}
        />
        <Metric
          label="Low confidence"
          value={lowConfidence}
          tone={lowConfidence ? 'warning' : undefined}
        />
        <Metric
          label="Missing weights"
          value={missingWeights}
          tone={missingWeights ? 'warning' : undefined}
        />
      </div>
      {top.length > 0 ? (
        <ul className="divide-y divide-line-subtle">
          {top.map((row) => (
            <li
              key={row.variantId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{row.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-4">
                  <span>{row.supplierName ?? 'No supplier'}</span>
                  {row.supplierKind ? <Badge tone="neutral">{row.supplierKind}</Badge> : null}
                  {row.reasons.includes('Stockout risk') ? (
                    <Badge tone="warning">Stockout risk</Badge>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[13px] font-medium text-ink">
                  {row.budgetQty} / {row.recommendedQty} units
                </p>
                <Money cents={row.budgetQty * row.landedUnitCostCents} size="sm" tone="muted" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-[13px] text-ink-3">Stock levels are covered for now.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-line-subtle border-t bg-inset px-4 py-2.5 text-[11px] text-ink-3">
        <span>
          {latestSnapshot ? (
            <>
              Last run {formatRunDate(latestSnapshot.runDate)} · next{' '}
              {formatRunDate(nextRun.toISOString())}
            </>
          ) : (
            <>No saved run · next {formatRunDate(nextRun.toISOString())}</>
          )}
          {fullCostCents !== budgetCostCents ? (
            <span className="ml-1">
              · Budget fit {formatMoneyText(budgetCostCents)} of{' '}
              {formatMoneyText(fullCostCents)}
            </span>
          ) : null}
        </span>
        <Link
          href="/reorder"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Review purchasing queue →
        </Link>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-ink-4">{label}</p>
      <p
        className={
          tone === 'warning'
            ? 'tabular mt-1 text-[18px] font-semibold text-warning'
            : 'tabular mt-1 text-[18px] font-semibold text-ink'
        }
      >
        {value}
      </p>
    </div>
  );
}

function formatRunDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    timeZone: REORDER_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  });
}

function formatMoneyText(cents: number) {
  return formatMoney(cents);
}
