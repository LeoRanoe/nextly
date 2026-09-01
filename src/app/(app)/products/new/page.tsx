import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductForm } from '@/components/forms/product-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listCategoryOptions, listSupplierOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Add a product' };

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title="Add a product"
        description="A product is what a customer recognises. Each colour, size or pack is a variant, and the variant is what carries stock, cost and price."
        action={
          <Button asChild variant="ghost">
            <Link href="/products">Cancel</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const [categories, suppliers] = await Promise.all([
    listCategoryOptions(),
    listSupplierOptions(),
  ]);
  return <ProductForm categories={categories} suppliers={suppliers} />;
}
