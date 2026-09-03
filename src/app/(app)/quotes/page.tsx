import { MessageSquareText } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { QuoteRequestActions } from '@/components/forms/quote-request-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
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
  TR,
} from '@/components/ui/table';
import { formatRelative, humanise } from '@/lib/format';
import { parseListParams, quoteQuerySchema, type RawSearchParams } from '@/lib/list-params';
import type { QuoteRequestStatus } from '@/lib/schemas';
import {
  listQuoteProductOptions,
  listQuoteRequests,
  listQuoteVariantOptions,
} from '@/server/queries/quotes';

export const metadata: Metadata = { title: 'Quote Requests' };

/** "new" is the one that needs an answer, so it is the only loud badge. */
const STATUS_TONE: Record<QuoteRequestStatus, 'accent' | 'info' | 'positive' | 'neutral'> = {
  new: 'accent',
  contacted: 'info',
  converted: 'positive',
  declined: 'neutral',
  archived: 'neutral',
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'archived', label: 'Archived' },
];

export default function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Quote requests"
        description="Messages the storefront received from visitors asking what something costs. Nothing here touches the books — a request becomes real only when you convert it into a draft sale."
        action={<ExportCsvLink entity="quote-requests" searchParams={searchParams} />}
      />
      <Surface className="overflow-hidden">
        <ListToolbar>
          <ListSearch placeholder="Search by name, contact or item" />
          <ListFilter param="status" label="Status" options={STATUS_OPTIONS} />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-36', 'w-20', 'w-24']} />}>
          <QuotesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function QuotesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(quoteQuerySchema, raw);
  const hasFilters = Boolean(query.q || query.status);
  const [result, variants, products] = await Promise.all([
    listQuoteRequests(query),
    listQuoteVariantOptions(),
    listQuoteProductOptions(),
  ]);

  if (result.total === 0 && !hasFilters) {
    return (
      <EmptyState
        Icon={MessageSquareText}
        title="No quote requests yet"
        description="When a visitor uses the request form on your storefront, their message lands here. Answer by phone or email, then convert the ones that turned into business."
      />
    );
  }

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={MessageSquareText}
        title="No requests match these filters"
        description="Try a different search or clear the status filter."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/quotes">Clear filters</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Requested</TH>
                <TH>Who</TH>
                <TH>Item</TH>
                <TH numeric>Qty</TH>
                <TH>Status</TH>
                <TH>Handled by</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {result.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-[12px] text-ink-3">
                    {formatRelative(row.createdAt)}
                  </TD>
                  <TD>
                    <span className="block text-ink">{row.name}</span>
                    <span className="block text-[12px] text-ink-4">{row.contact}</span>
                  </TD>
                  <TD className="text-ink-2">
                    {row.productName ? (
                      row.productSlug ? (
                        <Link
                          href={`/p/${row.productSlug}` as Route}
                          className="hover:text-accent hover:underline"
                        >
                          {row.productName}
                        </Link>
                      ) : (
                        row.productName
                      )
                    ) : (
                      <span className="text-ink-4">Not specified</span>
                    )}
                  </TD>
                  <TD numeric className="tabular text-ink-3">
                    {row.quantity}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
                  </TD>
                  <TD className="text-[12px] text-ink-3">{row.handledByName ?? '—'}</TD>
                  <TD className="text-right">
                    <span className="inline-flex items-center gap-2">
                      {row.saleId ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/sales/${row.saleId}` as Route}>View sale</Link>
                        </Button>
                      ) : null}
                      <QuoteRequestActions
                        id={row.id}
                        name={row.name}
                        contact={row.contact}
                        productId={row.productId}
                        quantity={row.quantity}
                        details={row.details}
                        status={row.status}
                        variants={variants}
                        products={products}
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
          <MobileRow key={row.id}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{row.name}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {row.contact} · {formatRelative(row.createdAt)}
                </span>
              </span>
              <Badge tone={STATUS_TONE[row.status]} className="shrink-0">
                {humanise(row.status)}
              </Badge>
            </MobileRowHeader>
            {row.details ? (
              <p className="line-clamp-2 text-[12px] text-ink-3 leading-relaxed">
                {row.details}
              </p>
            ) : null}
            <MobileRowMeta>
              <MobileRowMetaItem label="Item">
                {row.productName ?? 'Not specified'}
              </MobileRowMetaItem>
              <MobileRowMetaItem label="Qty">{row.quantity}</MobileRowMetaItem>
              <MobileRowMetaItem label="Handled by">
                {row.handledByName ?? '—'}
              </MobileRowMetaItem>
            </MobileRowMeta>
            <div className="flex justify-end pt-0.5">
              <span className="inline-flex items-center gap-2">
                {row.saleId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/sales/${row.saleId}` as Route}>View sale</Link>
                  </Button>
                ) : null}
                <QuoteRequestActions
                  id={row.id}
                  name={row.name}
                  contact={row.contact}
                  productId={row.productId}
                  quantity={row.quantity}
                  details={row.details}
                  status={row.status}
                  variants={variants}
                  products={products}
                />
              </span>
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

function buildHref(query: { q?: string; status?: string; page?: number }): Route {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return (search ? `/quotes?${search}` : '/quotes') as Route;
}
