import { ImageOff, Package } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListFilter, ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MobileList,
  MobileRow,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Money } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableSkeleton,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  THSort,
  TR,
} from '@/components/ui/table';
import { parseListParams, productQuerySchema, type RawSearchParams } from '@/lib/list-params';
import { listProducts } from '@/server/queries/lists';

export const metadata: Metadata = { title: 'Products' };

const STATUS_TONE = { draft: 'neutral', active: 'positive', archived: 'neutral' } as const;
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Products"
        description="A product is what a customer recognises; a variant is what is actually stocked and sold. Publishing a product is what will put it on the public catalog, from these same rows."
        action={
          <Button asChild variant="primary">
            <Link href="/products/new">Add product</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by name or code" />
          <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-44', 'w-24', 'w-16']} />}>
          <ProductsTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function ProductsTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(productQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.status);
  const result = await listProducts(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Package}
        title="No products yet"
        description="Add a product, give it a variant for each colour or size, and it becomes available to buy on a purchase order and to sell."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/products/new">Add product</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Package}
        title="No products match these filters"
        description="Try a different search or clear the status filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/products">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <THSort
                  href={buildHref({ ...query, sort: 'name', dir: nextDir('name'), page: 1 })}
                  active={query.sort === 'name'}
                  dir={query.dir}
                >
                  Product
                </THSort>
                <TH>Code</TH>
                <TH>Category</TH>
                <TH>Supplier</TH>
                <TH>Status</TH>
                <TH numeric>Variants</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'onHand',
                    dir: nextDir('onHand'),
                    page: 1,
                  })}
                  active={query.sort === 'onHand'}
                  dir={query.dir}
                  numeric
                >
                  On hand
                </THSort>
                <TH numeric>From</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'stockValue',
                    dir: nextDir('stockValue'),
                    page: 1,
                  })}
                  active={query.sort === 'stockValue'}
                  dir={query.dir}
                  numeric
                >
                  Stock value
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="text-ink">
                    <Link
                      href={`/products/${row.id}` as Route}
                      className="inline-flex items-center gap-2 rounded-row hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      {row.imageCount === 0 ? (
                        <ImageOff
                          className="size-3.5 shrink-0 text-ink-4"
                          aria-label="No image"
                        />
                      ) : null}
                      {row.name}
                    </Link>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {row.code}
                  </TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.categoryName ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.supplierName ?? '—'}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </Badge>
                      {row.catalogPublished ? <Badge tone="accent">Published</Badge> : null}
                    </span>
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.variantCount}
                  </TD>
                  <TD numeric>{row.onHand}</TD>
                  <TD numeric>
                    <Money cents={row.listPriceCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.stockValueCents} size="sm" />
                  </TD>
                  <TD className="text-right">
                    <ProductActions
                      id={row.id}
                      name={row.name}
                      status={row.status}
                      catalogPublished={row.catalogPublished}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => (
          <MobileRow key={row.id}>
            <Link
              href={`/products/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="flex min-w-0 items-center gap-1.5">
                  {row.imageCount === 0 ? (
                    <ImageOff className="size-3.5 shrink-0 text-ink-4" aria-label="No image" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{row.name}</span>
                    <span className="tabular block text-[11px] text-ink-4">{row.code}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONE[row.status]}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </Badge>
                  {row.catalogPublished ? <Badge tone="accent">Published</Badge> : null}
                </span>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Category">
                  {row.categoryName ?? '—'}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="On hand">{row.onHand}</MobileRowMetaItem>
                <MobileRowMetaItem label="From">
                  <Money cents={row.listPriceCents} size="sm" tone="muted" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Stock value">
                  <Money cents={row.stockValueCents} size="sm" />
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <ProductActions
                id={row.id}
                name={row.name}
                status={row.status}
                catalogPublished={row.catalogPublished}
              />
            </div>
          </MobileRow>
        ))}
      </MobileList>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        perPage={result.perPage}
        buildHref={(page) => buildHref({ ...query, page })}
      />
    </>
  );
}

function buildHref(query: {
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  page?: number;
}): Route {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.sort) params.set('sort', query.sort);
  if (query.dir) params.set('dir', query.dir);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return (search ? `/products?${search}` : '/products') as Route;
}
