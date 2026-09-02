import { AlertTriangle, Receipt } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SaleActions } from '@/components/forms/row-actions';
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
import { Money, Percent } from '@/components/ui/money';
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
import { parseListParams, type RawSearchParams, saleQuerySchema } from '@/lib/list-params';
import { PAYMENT_LABELS, type PaymentBadgeCode } from '@/lib/payment-status';
import { listSales } from '@/server/queries/lists';

export const metadata: Metadata = { title: 'Sales' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;
/** Money badges sit beside the status because they answer a different question:
 *  did the sale happen vs. did the cash arrive. Overdue is the only one that
 *  demands attention, so it is the only one in full colour. */
const PAYMENT_TONE: Record<PaymentBadgeCode, 'positive' | 'warning' | 'info' | 'negative'> = {
  paid: 'positive',
  partly: 'info',
  unpaid: 'warning',
  overdue: 'negative',
};
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'void', label: 'Void' },
];

export default function SalesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Each sale stores the exchange rate in force when it happened and the weighted-average cost it consumed, so neither a rate change nor a later purchase can rewrite a margin recorded months ago."
        action={
          <Button asChild variant="primary">
            <Link href="/sales/new">Record sale</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by number or customer" />
          <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
          <ExportButton entity="sales" searchParams={searchParams} />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-14', 'w-36', 'w-20']} />}>
          <SalesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function SalesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(saleQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.status);
  const result = await listSales(query);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={Receipt}
        title="No sales recorded yet"
        description="Recording a sale moves stock, books the cost of goods and posts the receipt to the cash ledger, all in one step."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/sales/new">Record sale</Link>
          </Button>
        }
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Receipt}
        title="No sales match these filters"
        description="Try a different search or clear the status filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/sales">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  const pageTotals = result.rows
    .filter((row) => row.status === 'confirmed')
    .reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.totalUsdCents,
        cogs: sum.cogs + row.cogsCents,
        gross: sum.gross + row.grossCents,
      }),
      { revenue: 0, cogs: 0, gross: 0 },
    );

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-[70px]">Number</TH>
                <THSort
                  href={buildHref({ ...query, sort: 'date', dir: nextDir('date'), page: 1 })}
                  active={query.sort === 'date'}
                  dir={query.dir}
                >
                  Date
                </THSort>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'customer',
                    dir: nextDir('customer'),
                    page: 1,
                  })}
                  active={query.sort === 'customer'}
                  dir={query.dir}
                >
                  Customer
                </THSort>
                <TH>Status</TH>
                <TH numeric>Units</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'revenue',
                    dir: nextDir('revenue'),
                    page: 1,
                  })}
                  active={query.sort === 'revenue'}
                  dir={query.dir}
                  numeric
                >
                  Revenue
                </THSort>
                <TH numeric>Cost</TH>
                <TH numeric>Gross</TH>
                <THSort
                  href={buildHref({
                    ...query,
                    sort: 'margin',
                    dir: nextDir('margin'),
                    page: 1,
                  })}
                  active={query.sort === 'margin'}
                  dir={query.dir}
                  numeric
                >
                  Margin
                </THSort>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="tabular whitespace-nowrap text-ink">
                    <Link
                      href={`/sales/${row.id}` as Route}
                      className="hover:text-accent hover:underline"
                    >
                      {row.number}
                    </Link>
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                    {formatDate(row.soldAt)}
                  </TD>
                  <TD className="text-ink-2">{row.customerName ?? '—'}</TD>
                  <TD>
                    {row.paymentStatus ? (
                      <Badge tone={PAYMENT_TONE[row.paymentStatus]}>
                        {PAYMENT_LABELS[row.paymentStatus]}
                      </Badge>
                    ) : (
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </Badge>
                    )}
                  </TD>
                  <TD numeric className="text-ink-3">
                    {row.unitCount}
                  </TD>
                  <TD numeric>
                    <Money cents={row.totalUsdCents} size="sm" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.cogsCents} size="sm" tone="muted" />
                  </TD>
                  <TD numeric>
                    <Money cents={row.grossCents} size="sm" tone="flow" />
                  </TD>
                  <TD numeric>
                    <span className="inline-flex items-center gap-1">
                      <Percent
                        value={row.totalUsdCents === 0 ? 0 : row.grossCents / row.totalUsdCents}
                        className={row.shortfall > 0 ? 'text-warning' : undefined}
                      />
                      {row.shortfall > 0 ? (
                        <span
                          title={`${row.shortfall} unit${row.shortfall === 1 ? '' : 's'} had no stock; cost of goods is understated`}
                        >
                          <AlertTriangle className="size-3 text-warning" />
                        </span>
                      ) : null}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <SaleActions
                      id={row.id}
                      number={row.number}
                      status={row.status}
                      totalCents={row.totalCents}
                      paidCents={row.paidCents}
                      paymentStatus={row.paymentStatus}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
            <tfoot className="border-line-subtle border-t bg-inset/60">
              <tr>
                <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={5}>
                  Confirmed, this page
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.revenue} size="sm" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.cogs} size="sm" tone="muted" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Money cents={pageTotals.gross} size="sm" tone="flow" />
                </td>
                <td className="h-9 px-3 text-right">
                  <Percent
                    value={pageTotals.revenue === 0 ? 0 : pageTotals.gross / pageTotals.revenue}
                  />
                </td>
                <td />
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </div>

      <MobileList>
        {result.rows.map((row) => (
          <MobileRow key={row.id}>
            <Link
              href={`/sales/${row.id}` as Route}
              className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MobileRowHeader>
                <span className="min-w-0">
                  <span className="tabular block text-[13px] text-ink">{row.number}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {row.customerName ?? '—'} · {formatDate(row.soldAt)}
                  </span>
                </span>
                <Badge
                  tone={
                    row.paymentStatus
                      ? PAYMENT_TONE[row.paymentStatus]
                      : STATUS_TONE[row.status]
                  }
                  className="shrink-0"
                >
                  {row.paymentStatus
                    ? PAYMENT_LABELS[row.paymentStatus]
                    : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                </Badge>
              </MobileRowHeader>
              <MobileRowMeta>
                <MobileRowMetaItem label="Units">{row.unitCount}</MobileRowMetaItem>
                <MobileRowMetaItem label="Revenue">
                  <Money cents={row.totalUsdCents} size="sm" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Gross">
                  <Money cents={row.grossCents} size="sm" tone="flow" />
                </MobileRowMetaItem>
                <MobileRowMetaItem label="Margin">
                  <Percent
                    value={row.totalUsdCents === 0 ? 0 : row.grossCents / row.totalUsdCents}
                  />
                </MobileRowMetaItem>
              </MobileRowMeta>
            </Link>
            <div className="flex justify-end pt-0.5">
              <SaleActions
                id={row.id}
                number={row.number}
                status={row.status}
                totalCents={row.totalCents}
                paidCents={row.paidCents}
                paymentStatus={row.paymentStatus}
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
  return (search ? `/sales?${search}` : '/sales') as Route;
}
