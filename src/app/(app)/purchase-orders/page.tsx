import { ShoppingCart } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ReceiveOrderSheet } from '@/components/forms/finance-sheets';
import { PurchaseOrderActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportButton } from '@/components/patterns/export-button';
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
import { formatDate } from '@/lib/format';
import {
  parseListParams,
  purchaseOrderQuerySchema,
  type RawSearchParams,
} from '@/lib/list-params';
import { listPurchaseOrders } from '@/server/queries/lists';

export const metadata: Metadata = { title: 'Purchase orders' };

const STATUS_TONE = {
  draft: 'neutral',
  ordered: 'info',
  shipped: 'accent',
  received: 'positive',
  cancelled: 'negative',
} as const;
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Freight, tax and card fees are costs of the goods, not general expenses. On receipt they are allocated across the order's lines pro-rata by value, so every unit carries what it truly cost to land."
        action={
          <Button asChild variant="primary">
            <Link href="/purchase-orders/new">New order</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by number or supplier" />
          <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
          <ExportButton entity="purchase-orders" searchParams={searchParams} />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-16', 'w-32', 'w-20']} />}>
          <OrdersTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function OrdersTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(purchaseOrderQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.status);
  const result = await listPurchaseOrders(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={ShoppingCart}
        title="No purchase orders yet"
        description="Raise an order when you buy from Amazon or AliExpress. Enter the goods and the shipping costs, and marking it received will cost the stock correctly."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/purchase-orders/new">New order</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={ShoppingCart}
        title="No orders match these filters"
        description="Try a different search or clear the status filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/purchase-orders">Clear filters</Link>
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
                <TH className="w-[88px]">Number</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'supplier',
                    dir: nextDir('supplier'),
                    page: 1,
                  })}
                  active={query.sort === 'supplier'}
                  dir={query.dir}
                >
                  Supplier
                </THSort>
                <TH>Status</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'ordered',
                    dir: nextDir('ordered'),
                    page: 1,
                  })}
                  active={query.sort === 'ordered'}
                  dir={query.dir}
                >
                  Ordered
                </THSort>
                <TH className="w-[92px]">Received</TH>
                <TH numeric>Units</TH>
                <TH numeric>Goods</TH>
                <TH numeric>Freight &amp; fees</TH>
                <THSort
                  href={buildHref({ ...query, sort: 'total', dir: nextDir('total'), page: 1 })}
                  active={query.sort === 'total'}
                  dir={query.dir}
                  numeric
                >
                  Landed total
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-ink">
                    <Link
                      href={`/purchase-orders/${row.id}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.number}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-2">{row.supplierName ?? '—'}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </Badge>
                      {row.unallocated ? (
                        <Badge
                          tone="negative"
                          title="Freight and fees were never costed into the goods"
                        >
                          Uncosted
                        </Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.orderedAt)}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.receivedAt)}
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.unitCount}
                  </TD>
                  <TD numeric className="text-ink-3">
                    <Money cents={row.goodsCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.overheadCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.totalCents} size="sm" />
                  </TD>
                  <TD className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {row.status === 'ordered' || row.status === 'shipped' ? (
                        <ReceiveOrderSheet
                          orderId={row.id}
                          orderNumber={row.number}
                          goodsCents={row.goodsCents}
                          overheadCents={row.overheadCents}
                          unitCount={row.unitCount}
                        />
                      ) : null}
                      <PurchaseOrderActions
                        id={row.id}
                        number={row.number}
                        status={row.status}
                        balanceCents={Math.max(row.landedCents - row.paidCents, 0)}
                      />
                    </span>
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
            <Link
              href={`/purchase-orders/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="min-w-0">
                  <span className="tabular block text-[13px] text-ink">{row.number}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {row.supplierName ?? '—'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={STATUS_TONE[row.status]}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </Badge>
                  {row.unallocated ? <Badge tone="negative">Uncosted</Badge> : null}
                </span>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Ordered">
                  {formatDate(row.orderedAt)}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Received">
                  {formatDate(row.receivedAt)}
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Units">{row.unitCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Landed total">
                  <Money cents={row.totalCents} size="sm" />
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex items-center justify-end gap-1 pt-0.5">
              {row.status === 'ordered' || row.status === 'shipped' ? (
                <ReceiveOrderSheet
                  orderId={row.id}
                  orderNumber={row.number}
                  goodsCents={row.goodsCents}
                  overheadCents={row.overheadCents}
                  unitCount={row.unitCount}
                />
              ) : null}
              <PurchaseOrderActions
                id={row.id}
                number={row.number}
                status={row.status}
                balanceCents={Math.max(row.landedCents - row.paidCents, 0)}
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
  return (search ? `/purchase-orders?${search}` : '/purchase-orders') as Route;
}
