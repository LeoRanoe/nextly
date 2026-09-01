import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SaleForm } from '@/components/forms/sale-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RATE_SCALE } from '@/lib/fx';
import { getCurrentRate } from '@/server/queries/overview';
import { listCustomerOptions, listVariantOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Record a sale' };

export default function NewSalePage() {
  return (
    <>
      <PageHeader
        title="Record a sale"
        description="Stock moves, the cost of goods is fixed at the weighted average in force right now, and the receipt posts to the cash ledger — all in one transaction."
        action={
          <Button asChild variant="ghost">
            <Link href="/sales">Cancel</Link>
          </Button>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const [variants, customers, rate] = await Promise.all([
    listVariantOptions(),
    listCustomerOptions(),
    getCurrentRate(),
  ]);

  return (
    <SaleForm
      variants={variants}
      customers={customers}
      rateMicros={rate?.rateMicros ?? RATE_SCALE}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[180px] rounded-card" />
      </div>
      <Skeleton className="h-[320px] rounded-card" />
    </div>
  );
}
