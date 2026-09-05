import { Package, PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListSearch } from '@/components/patterns/list-toolbar';
import { CatalogSort } from '@/components/store/catalog-sort';
import { CategoryPills } from '@/components/store/category-pills';
import { ProductCard } from '@/components/store/product-card';
import { StoreHero, StoreValues } from '@/components/store/store-hero';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RawSearchParams } from '@/lib/list-params';
import {
  type CatalogSort as CatalogSortValue,
  listCatalogCategories,
  listCatalogProducts,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Smart home store — Catalog',
  description:
    'Smart home devices, imported and in stock in Paramaribo, Suriname. Priced in SRD at the current rate — ask, order and collect on WhatsApp.',
};

const CATALOG_SORTS = ['newest', 'name', 'price-asc', 'price-desc'];

function isCatalogSort(value: string | undefined): value is CatalogSortValue {
  return Boolean(value) && CATALOG_SORTS.includes(value as string);
}

/**
 * The storefront home — Fairphone's shape, in Northlight.
 *
 * Promise first (the hero), then the catalogue with its categories as
 * pills, then the three things this shop can honestly promise (the value
 * band). `searchParams` is passed down unawaited so the hero and the
 * toolbar's shell stay part of the static prerender; only the pieces that
 * read live data are Suspense-wrapped and stream.
 */
export default function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <StoreHero />

      <section id="catalog" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 lg:px-6">
        <div className="mb-6 flex flex-col gap-4">
          <Suspense fallback={<PillsSkeleton />}>
            <CatalogPills />
          </Suspense>
          <Suspense fallback={<ToolbarSkeleton />}>
            <CatalogToolbar />
          </Suspense>
        </div>

        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogGrid searchParams={searchParams} />
        </Suspense>

        <StoreValues />
      </section>
    </>
  );
}

async function CatalogPills() {
  const categories = await listCatalogCategories();
  if (categories.length === 0) return null;
  return <CategoryPills categories={categories} />;
}

function PillsSkeleton() {
  return (
    <div className="flex gap-2" aria-hidden="true">
      <Skeleton className="h-8 w-24 rounded-full" />
      <Skeleton className="h-8 w-28 rounded-full" />
      <Skeleton className="h-8 w-20 rounded-full" />
    </div>
  );
}

async function CatalogToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListSearch placeholder="Search products" size="md" />
      <div className="ml-auto">
        <CatalogSort />
      </div>
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
      <Skeleton className="h-11 min-w-[200px] flex-1 rounded-full sm:max-w-[280px]" />
      <Skeleton className="ml-auto h-11 w-[180px] rounded-full" />
    </div>
  );
}

async function CatalogGrid({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const q = typeof raw.q === 'string' ? raw.q : undefined;
  const category = typeof raw.category === 'string' ? raw.category : undefined;
  const sortRaw = typeof raw.sort === 'string' ? raw.sort : undefined;
  const sort = isCatalogSort(sortRaw) ? sortRaw : undefined;

  const [products, rate, settings] = await Promise.all([
    listCatalogProducts({ q, category, sort }),
    getCurrentRate(),
    getSettings(),
  ]);

  if (products.length === 0) {
    const filtered = Boolean(q || category);
    return (
      <EmptyState
        Icon={filtered ? PackageSearch : Package}
        title={filtered ? 'Nothing matches that' : 'Nothing published yet'}
        description={
          filtered
            ? `No products match ${q ? `"${q}"` : 'that filter'}. Try a different search or clear the category.`
            : 'Products appear here the moment they are published to the catalog — price, pictures and availability straight from the books.'
        }
        action={
          filtered ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/">Clear filters</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          srdRate={rate?.rateMicros}
          whatsapp={settings?.whatsapp ?? null}
        />
      ))}
    </div>
  );
}

/** Matches the card geometry — image field, four rows — so streaming
 *  causes no shift. */
function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="store-card overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-5 pt-4">
            <Skeleton className="h-[11px] w-16" />
            <Skeleton className="h-[15px] w-2/3" />
            <Skeleton className="h-[12px] w-full" />
            <Skeleton className="h-[18px] w-24" />
            <Skeleton className="mt-2 h-9 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
