import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PurchaseOrderForm } from '@/components/forms/purchase-order-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listSupplierOptions, listVariantOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Raise a purchase order' };

export default function NewPurchaseOrderPage() {
  return (
    <>
      <PageHeader
        title="Raise a purchase order"
        description="Enter the goods and the freight separately. The panel on the right shows what each unit will actually cost once those costs are allocated, before you commit to the order."
        action={
          <Button asChild variant="ghost">
            <Link href="/purchase-orders">Cancel</Link>
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
  const [variants, suppliers] = await Promise.all([
    listVariantOptions(),
    listSupplierOptions(),
  ]);
  return <PurchaseOrderForm variants={variants} suppliers={suppliers} />;
}

function FormSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[180px] rounded-card" />
        <Skeleton className="h-[200px] rounded-card" />
      </div>
      <Skeleton className="h-[360px] rounded-card" />
    </div>
  );
}
