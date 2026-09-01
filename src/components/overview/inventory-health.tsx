import { Package } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { getInventoryHealth } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

/**
 * Stock, read as a position rather than a list.
 *
 * Each row draws sold, on-hand and inbound on one proportional bar, so the
 * question people actually ask ("is this about to run out, and is more coming?")
 * is answered by the shape rather than by comparing three columns of digits.
 */
export async function InventoryHealth() {
  const [rows, settings] = await Promise.all([getInventoryHealth(6), getSettings()]);
  // The same threshold the alerts panel reads, so a "Low" badge here and a
  // "running low" alert there can never disagree.
  const lowStockAt = settings?.lowStockThreshold ?? 5;

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Package}
        title="No products yet"
        description="Once a product has variants and a received purchase order, its stock position appears here."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/products">Add a product</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {rows.map((row) => {
        const total = Math.max(row.totalSold + Math.max(row.onHand, 0) + row.inbound, 1);
        const low = row.onHand > 0 && row.onHand <= lowStockAt;
        const out = row.onHand <= 0;

        return (
          <li key={row.variantId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] text-ink">
                {row.productName}
                <span className="text-ink-4"> · {row.variantName}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {out ? (
                  <Badge tone="negative">Out of stock</Badge>
                ) : low ? (
                  <Badge tone="warning">Low</Badge>
                ) : null}
                <Money cents={row.valueCents} size="sm" tone="muted" />
              </div>
            </div>

            <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full bg-inset">
              <Segment share={row.totalSold / total} className="bg-chart-2" />
              <Segment
                share={Math.max(row.onHand, 0) / total}
                className={cn(low ? 'bg-warning' : 'bg-chart-4')}
              />
              <Segment share={row.inbound / total} className="bg-line-strong" />
            </div>

            <div className="tabular mt-1.5 flex items-center gap-3 text-[11px] text-ink-4">
              <Legend className="bg-chart-2">{row.totalSold} sold</Legend>
              <Legend className={low ? 'bg-warning' : 'bg-chart-4'}>
                {row.onHand} on hand
              </Legend>
              {row.inbound > 0 ? (
                <Legend className="bg-line-strong">{row.inbound} inbound</Legend>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Segment({ share, className }: { share: number; className: string }) {
  if (share <= 0) return null;
  return <div className={className} style={{ width: `${share * 100}%` }} />;
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', className)} />
      {children}
    </span>
  );
}
