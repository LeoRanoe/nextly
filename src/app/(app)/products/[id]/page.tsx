import { ExternalLink } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProductForm } from '@/components/forms/product-form';
import { ProductImages } from '@/components/forms/product-images';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toDecimalString } from '@/lib/money';
import { listCategoryOptions, listSupplierOptions } from '@/server/queries/pickers';
import { getProduct } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Product' };

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageHeader
        title="Product"
        description="Stock and cost are never edited here. They are the consequence of purchase orders and sales."
        action={
          <Button asChild variant="ghost">
            <Link href="/products">Back</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[520px] rounded-card" />}>
        <Loader params={params} />
      </Suspense>
    </>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, suppliers] = await Promise.all([
    getProduct(id),
    listCategoryOptions(),
    listSupplierOptions(),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-4">
      {product.catalogPublished ? (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/catalog/${product.slug}` as Route} target="_blank">
              <ExternalLink className="size-3.5" /> View in catalog
            </Link>
          </Button>
        </div>
      ) : null}
      <ProductImages productId={product.id} initial={product.images} />
      <ProductForm
        categories={categories}
        suppliers={suppliers}
        initial={{
          id: product.id,
          code: product.code,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          supplierId: product.supplierId,
          sourceUrl: product.sourceUrl ?? '',
          summary: product.summary ?? '',
          description: product.description ?? '',
          status: product.status,
          catalogPublished: product.catalogPublished,
          notes: product.notes ?? '',
          variants: product.variants.map((variant) => ({
            key: variant.id,
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            listPrice: toDecimalString(variant.listPriceCents),
            referenceCost: toDecimalString(variant.referenceCostCents),
            isActive: variant.isActive,
          })),
        }}
      />
    </div>
  );
}
