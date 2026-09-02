import { HandCoins } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { formatDate, formatRelative } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { getMoneyOwed } from '@/server/queries/overview';

/**
 * Accounts receivable (F-4).
 *
 * The panel answers the question a credit sale actually creates: not "how much
 * was sold" but "how much has not arrived yet". Rows are oldest first because
 * age is what turns an outstanding balance into a problem; the totals above
 * them cover every unpaid sale, while the list shows only the oldest few.
 */
export async function MoneyOwed() {
  const owed = await getMoneyOwed(6);

  if (owed.rows.length === 0) {
    return (
      <EmptyState
        Icon={HandCoins}
        title="Nothing is owed"
        description="Every confirmed sale has been paid for in full. When a sale goes on credit, it appears here until the last payment lands."
      />
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-line-subtle border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-3">
            {owed.salesCount} {owed.salesCount === 1 ? 'sale' : 'sales'} on credit
          </p>
          {owed.overdueUsdCents > 0 ? (
            <p className="mt-0.5 text-[11px] text-negative">
              {formatMoney(owed.overdueUsdCents)} overdue
              {owed.oldestSoldAt ? ` · oldest from ${formatDate(owed.oldestSoldAt)}` : ''}
            </p>
          ) : null}
        </div>
        <Money cents={owed.totalUsdCents} size="xl" className="shrink-0" />
      </div>
      <ul className="divide-y divide-line-subtle">
        {owed.rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/sales/${row.id}` as Route}
              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-inset/60 focus-visible:bg-inset/60"
            >
              <span className="min-w-0">
                <span className="tabular block text-[13px] text-ink">{row.number}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {row.customerName ?? 'Walk-in customer'} · {formatRelative(row.soldAt)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {row.overdue ? <Badge tone="negative">Overdue</Badge> : null}
                <Money
                  cents={row.balanceCents}
                  currency={row.currency === 'SRD' ? 'SRD' : 'USD'}
                  size="sm"
                  tone={row.overdue ? 'flow' : 'muted'}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
