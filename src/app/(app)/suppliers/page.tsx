import { Truck } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SupplierSheet } from '@/components/forms/reference-sheets';
import { SupplierActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportButton } from '@/components/patterns/export-button';
import { ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, THSort, TR } from '@/components/ui/table';
import { humanise } from '@/lib/format';
import { parseListParams, type RawSearchParams, supplierQuerySchema } from '@/lib/list-params';
import { listSuppliers } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Suppliers' };

export default function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Where stock is bought. Spend is the landed total of every received order, so it includes the freight and fees paid to that supplier."
        action={
          <Suspense fallback={null}>
            <SupplierSheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by name" />
          <ExportButton entity="suppliers" searchParams={searchParams} />
        </ListToolbar>
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <SuppliersTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function SuppliersTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(supplierQuerySchema, raw);
  const hasFilters = Boolean(query.q);
  const result = await listSuppliers(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Truck}
        title="No suppliers yet"
        description="Add Amazon, AliExpress or a local supplier before raising a purchase order against them."
        action={
          <Suspense fallback={null}>
            <SupplierSheet />
          </Suspense>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Truck}
        title="No suppliers match this search"
        description="Try a different name."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/suppliers">Clear search</Link>
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
                  Supplier
                </THSort>
                <TH>Kind</TH>
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
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'orders',
                    dir: nextDir('orders'),
                    page: 1,
                  })}
                  active={query.sort === 'orders'}
                  dir={query.dir}
                  numeric
                >
                  Orders
                </THSort>
                <THSort
                  href={buildHref({ ...query, sort: 'spend', dir: nextDir('spend'), page: 1 })}
                  active={query.sort === 'spend'}
                  dir={query.dir}
                  numeric
                >
                  Landed spend
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="text-ink">
                    <Link
                      href={`/suppliers/${row.id}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge>{humanise(row.kind)}</Badge>
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.productCount}
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.orderCount}
                  </TD>
                  <TD numeric>
                    <Money cents={row.spendCents} size="sm" />
                  </TD>
                  <TD className="text-right">
                    <SupplierActions
                      id={row.id}
                      name={row.name}
                      kind={row.kind}
                      website={row.website}
                      notes={row.notes}
                      productCount={row.productCount}
                      orderCount={row.orderCount}
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
              href={`/suppliers/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="text-[13px] text-ink">{row.name}</span>
                <Badge className="shrink-0">{humanise(row.kind)}</Badge>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Products">{row.productCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Orders">{row.orderCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Landed spend">
                  <Money cents={row.spendCents} size="sm" />
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <SupplierActions
                id={row.id}
                name={row.name}
                kind={row.kind}
                website={row.website}
                notes={row.notes}
                productCount={row.productCount}
                orderCount={row.orderCount}
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
  return (search ? `/suppliers?${search}` : '/suppliers') as Route;
}
