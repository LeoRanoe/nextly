import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertsPanel } from '@/components/overview/alerts-panel';
import { CashFlowChart } from '@/components/overview/cash-flow-chart';
import { InventoryHealth } from '@/components/overview/inventory-health';
import { MarginLeaders } from '@/components/overview/margin-leaders';
import { MarginWaterfall } from '@/components/overview/margin-waterfall';
import { OwnerEquity } from '@/components/overview/owner-equity';
import { PositionStrip, PositionStripSkeleton } from '@/components/overview/position-strip';
import { RecentActivity } from '@/components/overview/recent-activity';
import { PageHeader } from '@/components/patterns/page-header';
import { PeriodSelector } from '@/components/patterns/period-selector';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatRate } from '@/lib/fx';
import { isPeriodPreset, type PeriodPreset } from '@/lib/report-period';
import { getCashFlow, getCurrentRate } from '@/server/queries/overview';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const metadata: Metadata = { title: 'Overview' };

type SearchParams = Promise<{ period?: string }>;

/**
 * The Overview.
 *
 * Every panel streams behind its own Suspense boundary, so a slow aggregate
 * holds up one card rather than the page. The shell, the headings and the
 * skeleton geometry are all part of the static prerender. Only the
 * waterfall reads `?period=` — the rest of the page is a position, and a
 * position is always "right now".
 */
export default function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
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
            <SurfaceHeader
              title="Revenue to net"
              hint="Where the money actually goes"
              action={
                <Suspense fallback={null}>
                  <PeriodSelector defaultValue="all" />
                </Suspense>
              }
            />
            <Suspense fallback={<Skeleton className="m-4 h-[260px]" />}>
              <Waterfall searchParams={searchParams} />
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

        <div className="grid gap-4 xl:grid-cols-3">
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
          <Surface>
            <SurfaceHeader
              title="Margin leaders"
              hint="Lifetime gross profit by product"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/reports">Reports</Link>
                </Button>
              }
            />
            <Suspense fallback={<PanelSkeleton rows={5} />}>
              <MarginLeaders />
            </Suspense>
          </Surface>
          <Surface>
            <SurfaceHeader
              title="Recent activity"
              hint="Every change to the books, in the order it happened"
            />
            <Suspense fallback={<PanelSkeleton rows={8} />}>
              <RecentActivity />
            </Suspense>
          </Surface>
        </div>
      </div>
    </>
  );
}

async function CashFlow() {
  const data = await getCashFlow(12);
  return <CashFlowChart data={data} />;
}

async function Waterfall({ searchParams }: { searchParams: SearchParams }) {
  const { period } = await searchParams;
  const preset: PeriodPreset = isPeriodPreset(period) ? period : 'all';
  return <MarginWaterfall preset={preset} />;
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
