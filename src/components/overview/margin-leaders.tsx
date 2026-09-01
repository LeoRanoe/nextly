import { Trophy } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';
import { Money, Percent } from '@/components/ui/money';
import { formatMoney } from '@/lib/money';
import { listProductMargins } from '@/server/queries/reports';

/**
 * What actually earns.
 *
 * Lifetime gross profit ranked by product, straight from `v_product_margins`
 * — the same view the Reports page reads, so the ranking here and the table
 * there cannot disagree. Answers the question behind the question: not just
 * what sold, but what was worth selling.
 */
export async function MarginLeaders({ limit = 5 }: { limit?: number }) {
  const rows = (await listProductMargins('gross')).slice(0, limit);

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Trophy}
        title="Nothing sold yet"
        description="Once a sale is confirmed, products rank here by the gross profit they actually earned, freight and fees included."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/sales/new">Record a sale</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {rows.map((row) => (
        <li key={row.productId}>
          <Link
            href={`/products/${row.productId}` as Route}
            className="block px-4 py-2.5 transition-colors hover:bg-hover"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] text-ink">{row.name}</p>
              <Money cents={row.grossCents} size="sm" tone="flow" />
            </div>
            <div className="tabular mt-0.5 flex items-center justify-between gap-3 text-[11px] text-ink-4">
              <span>
                {row.unitsSold} sold · {formatMoney(row.revenueCents)} revenue
              </span>
              <Percent value={row.marginRate} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
