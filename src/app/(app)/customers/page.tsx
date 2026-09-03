import { Users } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CustomerSheet } from '@/components/forms/reference-sheets';
import { CustomerActions } from '@/components/forms/row-actions';
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
import { formatRelative } from '@/lib/format';
import { customerQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listCustomers } from '@/server/queries/lists';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Order counts and lifetime spend are derived from confirmed sales, so they cannot drift out of step with the sales themselves."
        action={
          <Suspense fallback={null}>
            <CustomerSheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by name, code, phone or email" />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-16', 'w-40', 'w-16']} />}>
          <CustomersTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function CustomersTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(customerQuerySchema, raw);
  const hasFilters = Boolean(query.q);
  const result = await listCustomers(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Users}
        title="No customers yet"
        description="Customers can be created inline while recording a sale, so there is no separate step to remember."
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Users}
        title="No customers match this search"
        description="Try a different name, code, phone or email."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/customers">Clear search</Link>
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
                <TH className="w-[70px]">Code</TH>
                <THSort
                  href={buildHref({ ...query, sort: 'name', dir: nextDir('name'), page: 1 })}
                  active={query.sort === 'name'}
                  dir={query.dir}
                >
                  Name
                </THSort>
                <TH>Contact</TH>
                <TH>City</TH>
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
                  href={buildHref({ ...query, sort: 'spent', dir: nextDir('spent'), page: 1 })}
                  active={query.sort === 'spent'}
                  dir={query.dir}
                  numeric
                >
                  Spent
                </THSort>
                <TH numeric>Gross earned</TH>
                <TH>Last order</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-ink-3">{row.code}</TD>
                  <TD className="text-ink">
                    <Link
                      href={`/customers/${row.id}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-3">
                    {row.phone ?? row.email ?? '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-ink-3">{row.city ?? '—'}</TD>
                  <TD numeric className="text-ink-3">
                    {row.orderCount}
                  </TD>
                  <TD numeric>
                    <Money cents={row.spentCents} size="sm" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.grossCents} size="sm" tone="flow" />
                  </TD>
                  <TD className="whitespace-nowrap text-[12px] text-ink-4">
                    {formatRelative(row.lastOrderAt)}
                  </TD>
                  <TD className="text-right">
                    <CustomerActions
                      id={row.id}
                      name={row.name}
                      phone={row.phone ?? ''}
                      email={row.email ?? ''}
                      addressLine={row.addressLine ?? ''}
                      city={row.city ?? ''}
                      notes={row.notes ?? ''}
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
              href={`/customers/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{row.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {row.phone ?? row.email ?? '—'}
                  </span>
                </span>
                <Money cents={row.spentCents} size="sm" className="shrink-0" />
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="City">{row.city ?? '—'}</MobileRowMetaItem>
                <MobileRowMetaItem label="Orders">{row.orderCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Gross earned">
                  <Money cents={row.grossCents} size="sm" tone="flow" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Last order">
                  {formatRelative(row.lastOrderAt)}
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <CustomerActions
                id={row.id}
                name={row.name}
                phone={row.phone ?? ''}
                email={row.email ?? ''}
                addressLine={row.addressLine ?? ''}
                city={row.city ?? ''}
                notes={row.notes ?? ''}
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
  return (search ? `/customers?${search}` : '/customers') as Route;
}
