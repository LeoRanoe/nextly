import { Package } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductCard } from '@/components/store/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import { listCatalogProducts } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'Connected devices, imported and sold in Paramaribo. Priced in USD, shown in SRD at the current rate.',
};

export default function CatalogPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="font-medium text-[20px] text-ink tracking-[-0.02em]">Catalog</h1>
        <p className="mt-1 max-w-[62ch] text-[13px] text-ink-3 leading-relaxed">
          Connected devices, imported and sold in Paramaribo. What shows as in stock is on the
          shelf right now — the same ledger the business runs on, read out loud.
        </p>
      </header>

      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogGrid />
      </Suspense>
    </>
  );
}

async function CatalogGrid() {
  const [products, rate] = await Promise.all([listCatalogProducts(), getCurrentRate()]);

  if (products.length === 0) {
    return (
      <div className="rounded-card border border-line-subtle bg-raised px-6 py-16 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-card border border-line-subtle bg-inset text-ink-4">
          <Package className="size-[18px]" />
        </div>
        <p className="mt-3 font-medium text-[14px] text-ink">Nothing published yet</p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-ink-3 leading-relaxed">
          Products appear here the moment they are published to the catalog — price, pictures
          and availability straight from the books.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} srdRate={rate?.rateMicros} />
      ))}
    </div>
  );
}

/** Matches the card geometry — image field, three rows — so streaming
 *  causes no shift. */
function CatalogSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {['a', 'b', 'c', 'd'].map((key) => (
        <div
          key={key}
          className="overflow-hidden rounded-card border border-line-subtle bg-raised"
        >
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-[14px] w-2/3" />
            <Skeleton className="h-[12px] w-full" />
            <Skeleton className="h-[15px] w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
