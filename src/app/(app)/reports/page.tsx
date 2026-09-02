import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/patterns/page-header';
import { PeriodSelector } from '@/components/patterns/period-selector';
import { FxExposureReport } from '@/components/reports/fx-exposure';
import { MarginByProduct } from '@/components/reports/margin-by-product';
import { ProfitAndLossReport } from '@/components/reports/profit-and-loss';
import { Skeleton } from '@/components/ui/skeleton';
import { isPeriodPreset, type PeriodPreset } from '@/lib/report-period';
import type { ProductMarginSort } from '@/server/queries/reports';
import { getFxExposure } from '@/server/queries/reports';

export const metadata: Metadata = { title: 'Reports' };

type SearchParams = Promise<{ period?: string; marginSort?: string }>;

export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Profit and loss over a chosen period, margin by product, and exposure to the exchange rate — everything already in the ledgers, read back out."
        action={
          <Suspense fallback={null}>
            <PeriodSelector />
          </Suspense>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-[340px] rounded-card" />}>
          <PnlSection searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[340px] rounded-card" />}>
          <FxSection />
        </Suspense>
      </div>
      <div className="mt-4">
        <Suspense fallback={<Skeleton className="h-[280px] rounded-card" />}>
          <MarginSection searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function FxSection() {
  const exposure = await getFxExposure();
  return <FxExposureReport exposure={exposure} />;
}

async function PnlSection({ searchParams }: { searchParams: SearchParams }) {
  const { period } = await searchParams;
  const preset: PeriodPreset = isPeriodPreset(period) ? period : 'all';
  return <ProfitAndLossReport preset={preset} />;
}

async function MarginSection({ searchParams }: { searchParams: SearchParams }) {
  const { period, marginSort } = await searchParams;
  const preset: PeriodPreset = isPeriodPreset(period) ? period : 'all';
  const sort: ProductMarginSort =
    marginSort === 'revenue' || marginSort === 'units' ? marginSort : 'gross';
  return <MarginByProduct sort={sort} period={preset} />;
}
