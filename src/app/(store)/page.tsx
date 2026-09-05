import { Package, PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListSearch } from '@/components/patterns/list-toolbar';
import { CatalogSort } from '@/components/store/catalog-sort';
import { CatalogSpotlight } from '@/components/store/catalog-spotlight';
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
  title: 'Smart home catalog',
  description:
    'Smart home devices, imported and in stock in Paramaribo, Suriname. Priced in SRD at the current rate. Ask, order and collect on WhatsApp.',
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

      <section
        id="catalog"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-16 lg:px-6 lg:pb-20"
      >
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
  // A single real category next to "Everything" filters nothing — the row
  // only earns its place once there's an actual choice to make.
  if (categories.length < 2) return null;
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
            : 'Products appear here the moment they are published to the catalog, with price, pictures and availability straight from the books.'
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

  // A young catalog forced into a grid built for dozens is what makes it
  // read as empty rather than curated — below this size it gets the more
  // spacious, editorial spotlight treatment instead (`catalog-spotlight.tsx`).
  if (products.length <= 3) {
    return (
      <CatalogSpotlight
        products={products}
        srdRate={rate?.rateMicros}
        whatsapp={settings?.whatsapp ?? null}
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

/** Shaped after the spotlight's one-product feature rather than the 4+ grid
 *  — today's catalog (and the near-term one) is far more likely to land
 *  there. Crossing the 4-item threshold costs one acceptable one-time
 *  reflow rather than an extra pre-count query or new client state just to
 *  pick the right skeleton. */
function CatalogSkeleton() {
  return (
    <div
      className="store-card grid overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
      aria-hidden="true"
    >
      <Skeleton className="aspect-square w-full rounded-none lg:aspect-auto" />
      <div className="space-y-3 p-8 lg:p-12">
        <Skeleton className="h-[11px] w-24" />
        <Skeleton className="h-[26px] w-3/4" />
        <Skeleton className="h-[14px] w-full" />
        <Skeleton className="h-[14px] w-2/3" />
        <Skeleton className="mt-2 h-[30px] w-32" />
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}
