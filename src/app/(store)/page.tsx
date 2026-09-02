import { Package, PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListFilter, ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { CatalogSort } from '@/components/store/catalog-sort';
import { ProductCard } from '@/components/store/product-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RawSearchParams } from '@/lib/list-params';
import {
  type CatalogSort as CatalogSortValue,
  listCatalogCategories,
  listCatalogProducts,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';

export const metadata: Metadata = {
  title: 'Catalog',
  description:
    'Connected devices, imported and sold in Paramaribo. Priced in USD, shown in SRD at the current rate.',
};

const CATALOG_SORTS = ['newest', 'name', 'price-asc', 'price-desc'];

function isCatalogSort(value: string | undefined): value is CatalogSortValue {
  return Boolean(value) && CATALOG_SORTS.includes(value as string);
}

/**
 * The catalog. The site's home page — see docs/adr/0010-storefront-at-root.md.
 *
 * `searchParams` is passed down unawaited so the header and the toolbar's
 * shell stay part of the static prerender; only `CatalogGrid`, which
 * actually needs the query, is dynamic.
 */
export default function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <header className="mb-6">
        <h1 className="font-medium text-[20px] text-ink tracking-[-0.02em]">
          Devices, imported and in stock
        </h1>
        <p className="mt-1 max-w-[62ch] text-[13px] text-ink-3 leading-relaxed">
          Connected devices, imported and sold in Paramaribo. What shows as in stock is on the
          shelf right now — the same ledger the business runs on, read out loud.
        </p>
      </header>

      <Suspense fallback={<ToolbarSkeleton />}>
        <CatalogToolbar />
      </Suspense>

      <div className="mt-4">
        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogGrid searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function CatalogToolbar() {
  const categories = await listCatalogCategories();
  return (
    <ListToolbar>
      <ListSearch placeholder="Search products" />
      {categories.length > 0 ? (
        <ListFilter
          param="category"
          label="Category"
          options={categories.map((category) => ({
            value: category.slug,
            label: `${category.name} (${category.count})`,
          }))}
        />
      ) : null}
      <CatalogSort />
    </ListToolbar>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-line-subtle border-b p-3">
      <Skeleton className="h-8 min-w-[200px] flex-1 sm:max-w-[280px]" />
      <Skeleton className="h-8 w-[120px]" />
      <Skeleton className="h-8 w-[160px]" />
    </div>
  );
}

async function CatalogGrid({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const q = typeof raw.q === 'string' ? raw.q : undefined;
  const category = typeof raw.category === 'string' ? raw.category : undefined;
  const sortRaw = typeof raw.sort === 'string' ? raw.sort : undefined;
  const sort = isCatalogSort(sortRaw) ? sortRaw : undefined;

  const [products, rate] = await Promise.all([
    listCatalogProducts({ q, category, sort }),
    getCurrentRate(),
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
