import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertsPanel } from '@/components/overview/alerts-panel';
import { CashFlowChart } from '@/components/overview/cash-flow-chart';
import { InventoryHealth } from '@/components/overview/inventory-health';
import { MarginWaterfall } from '@/components/overview/margin-waterfall';
import { OwnerEquity } from '@/components/overview/owner-equity';
import { PositionStrip, PositionStripSkeleton } from '@/components/overview/position-strip';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatRate } from '@/lib/fx';
import { getCashFlow, getCurrentRate } from '@/server/queries/overview';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Overview' };

/**
 * The Overview.
 *
 * Every panel streams behind its own Suspense boundary, so a slow aggregate
 * holds up one card rather than the page. The shell, the headings and the
 * skeleton geometry are all part of the static prerender.
 */
export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Cash, stock and margin as they stand right now. Every figure is derived from the ledgers, not typed in."
        meta={
          <Suspense fallback={<Skeleton className="h-[12px] w-40" />}>
            <RateNote />
          </Suspense>
        }
        action={
          <>
            <Button asChild variant="secondary">
              <Link href="/purchase-orders/new">New order</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/sales/new">
                <Plus className="size-4" /> Record sale
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Suspense fallback={<PositionStripSkeleton />}>
          <PositionStrip />
        </Suspense>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Surface>
            <SurfaceHeader
              title="Cash flow"
              hint="Money in and out by week, with the closing balance"
            />
            <Suspense fallback={<Skeleton className="m-4 h-[220px]" />}>
              <CashFlow />
            </Suspense>
          </Surface>

          <Surface>
            <SurfaceHeader title="Revenue to net" hint="Where the money actually goes" />
            <Suspense fallback={<Skeleton className="m-4 h-[260px]" />}>
              <MarginWaterfall />
            </Suspense>
          </Surface>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Surface>
            <SurfaceHeader
              title="Needs attention"
              hint="Inconsistencies the books can detect on their own"
            />
            <Suspense fallback={<PanelSkeleton rows={3} />}>
              <AlertsPanel />
            </Suspense>
          </Surface>

          <Surface>
            <SurfaceHeader
              title="Stock position"
              hint="Sold, on hand and inbound"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inventory">All stock</Link>
                </Button>
              }
            />
            <Suspense fallback={<PanelSkeleton rows={3} />}>
              <InventoryHealth />
            </Suspense>
          </Surface>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Surface>
            <SurfaceHeader
              title="Owner equity"
              hint="Contributions less draws"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/owners">Detail</Link>
                </Button>
              }
            />
            <Suspense fallback={<PanelSkeleton rows={2} />}>
              <OwnerEquity />
            </Suspense>
          </Surface>
          <div />
        </div>
      </div>
    </>
  );
}

async function CashFlow() {
  const data = await getCashFlow(12);
  return <CashFlowChart data={data} />;
}

async function RateNote() {
  const rate = await getCurrentRate();
  if (!rate) return <span>No exchange rate set</span>;
  return (
    <span>
      USD base ·{' '}
      <span className="tabular text-ink-3">1 USD = {formatRate(rate.rateMicros, 2)} SRD</span>{' '}
      since{' '}
      {rate.effectiveFrom.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
    </span>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-line-subtle">
      {SKELETON_ROWS.slice(0, rows).map((key) => (
        <div key={key} className="space-y-2 px-4 py-3">
          <Skeleton className="h-[13px] w-2/3" />
          <Skeleton className="h-[12px] w-full" />
        </div>
      ))}
    </div>
  );
}
