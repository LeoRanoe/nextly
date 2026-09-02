import { Tags } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CategorySheet } from '@/components/forms/reference-sheets';
import { CategoryActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import {
  MobileList,
  MobileRow,
  MobileRowHeader,
  MobileRowMeta,
  MobileRowMetaItem,
} from '@/components/ui/mobile-list';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, THSort, TR } from '@/components/ui/table';
import { categoryQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listCategories } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Categories"
        description="How products are grouped — here, and as the filter chips on the public catalog."
        action={
          <Suspense fallback={null}>
            <CategorySheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by name or slug" />
        </ListToolbar>
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <CategoriesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function CategoriesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(categoryQuerySchema, raw);
  const hasFilters = Boolean(query.q);
  const result = await listCategories(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Tags}
        title="No categories yet"
        description="Categories group products here and on the public catalog. A product can go without one."
        action={
          <Suspense fallback={null}>
            <CategorySheet />
          </Suspense>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Tags}
        title="No categories match this search"
        description="Try a different name or slug."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/categories">Clear search</Link>
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
                  Name
                </THSort>
                <TH>Slug</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'products',
                    dir: nextDir('products'),
                    page: 1,
                  })}
                  active={query.sort === 'products'}
                  dir={query.dir}
                  numeric
                >
                  Products
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="text-ink">{row.name}</TD>
                  <TD className="tabular text-[12px] text-ink-3">{row.slug}</TD>
                  <TD numeric className="text-ink-2">
                    {row.productCount}
                  </TD>
                  <TD className="text-right">
                    <CategoryActions
                      id={row.id}
                      name={row.name}
                      slug={row.slug}
                      productCount={row.productCount}
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
          <MobileRow key={row.id} interactive={false}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{row.name}</span>
                <span className="tabular block text-[11px] text-ink-4">{row.slug}</span>
              </span>
              <MobileRowMeta className="w-auto shrink-0 grid-cols-1 text-right">
                <MobileRowMetaItem label="Products">{row.productCount}</MobileRowMetaItem>
              </MobileRowMeta>
            </MobileRowHeader>
            <div className="flex justify-end pt-0.5">
              <CategoryActions
                id={row.id}
                name={row.name}
                slug={row.slug}
                productCount={row.productCount}
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

function buildHref(query: { q?: string; sort?: string; dir?: string; page?: number }): Route {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  if (query.dir) params.set('dir', query.dir);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return (search ? `/categories?${search}` : '/categories') as Route;
}
