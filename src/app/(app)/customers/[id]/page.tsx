import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CustomerActions } from '@/components/forms/row-actions';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatRelative, humanise } from '@/lib/format';
import { PAYMENT_LABELS, type PaymentBadgeCode } from '@/lib/payment-status';
import type { WarrantyState } from '@/lib/warranty';
import { getCustomer } from '@/server/queries/reference';
import { listCustomerWarrantyItems } from '@/server/queries/warranty';

export const metadata: Metadata = { title: 'Customer' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;
const PAYMENT_TONE: Record<PaymentBadgeCode, 'positive' | 'warning' | 'info' | 'negative'> = {
  paid: 'positive',
  partly: 'info',
  unpaid: 'warning',
  overdue: 'negative',
};

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageHeader
        title="Customer"
        description="Order count and lifetime spend are derived from confirmed sales — never typed in, so they cannot drift out of step with the sales themselves."
        action={
          <Button asChild variant="ghost">
            <Link href="/customers">Back</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[380px] rounded-card" />}>
        <Loader params={params} />
      </Suspense>
    </>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, warrantyItems] = await Promise.all([
    getCustomer(id),
    listCustomerWarrantyItems(id),
  ]);

  if (!customer) notFound();

  return (
    <div className="space-y-4">
      <Surface>
        <SurfaceHeader
          title={
            <span className="inline-flex items-center gap-2">
              {customer.name}
              <Badge className="tabular">{customer.code}</Badge>
            </span>
          }
          hint={customer.city ?? undefined}
          action={
            <CustomerActions
              id={customer.id}
              name={customer.name}
              phone={customer.phone ?? ''}
              email={customer.email ?? ''}
              addressLine={customer.addressLine ?? ''}
              city={customer.city ?? ''}
              notes={customer.notes ?? ''}
            />
          }
        />
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Field label="Phone" value={customer.phone ?? '—'} />
          <Field label="Email" value={customer.email ?? '—'} />
          <Field label="Address" value={customer.addressLine ?? '—'} />
          <Field label="Last order" value={formatRelative(customer.lastOrderAt)} />
        </div>
        {customer.notes ? (
          <div className="border-line-subtle border-t px-4 py-3">
            <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Notes</p>
            <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{customer.notes}</p>
          </div>
        ) : null}
      </Surface>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={String(customer.orderCount)} />
        <Stat label="Lifetime spend" money={customer.spentCents} />
        <Stat label="Gross earned" money={customer.grossCents} tone="flow" />
      </div>

      {customer.outstandingUsdCents > 0 ? (
        <Surface>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[11px] text-negative uppercase tracking-[0.06em]">
                Money owed
              </p>
              <p className="mt-1 text-[12px] text-ink-3">
                Confirmed sales this customer has not paid for in full yet.
              </p>
            </div>
            <Money
              cents={customer.outstandingUsdCents}
              size="xl"
              tone="flow"
              className="shrink-0"
            />
          </div>
        </Surface>
      ) : null}

      <Surface className="overflow-hidden">
        <SurfaceHeader title="Order history" />
        {customer.sales.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-4">No sales yet.</p>
        ) : (
          <>
            <div className="hidden lg:block">
              <TableWrap>
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Number</TH>
                      <TH>Date</TH>
                      <TH>Status</TH>
                      <TH numeric>Revenue</TH>
                      <TH numeric>Owed</TH>
                      <TH numeric>Gross</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {customer.sales.map((sale) => (
                      <TR key={sale.id}>
                        <TD className="tabular whitespace-nowrap text-ink">
                          <Link
                            href={`/sales/${sale.id}` as Route}
                            className="hover:text-accent hover:underline"
                          >
                            {sale.number}
                          </Link>
                        </TD>
                        <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                          {formatDate(sale.soldAt)}
                        </TD>
                        <TD>
                          {sale.paymentStatus ? (
                            <Badge tone={PAYMENT_TONE[sale.paymentStatus]}>
                              {PAYMENT_LABELS[sale.paymentStatus]}
                            </Badge>
                          ) : (
                            <Badge tone={STATUS_TONE[sale.status as keyof typeof STATUS_TONE]}>
                              {humanise(sale.status)}
                            </Badge>
                          )}
                        </TD>
                        <TD numeric>
                          <Money cents={sale.totalUsdCents} size="sm" />
                        </TD>
                        <TD numeric>
                          {sale.balanceCents > 0 ? (
                            <Money
                              cents={sale.balanceCents}
                              currency={sale.currency}
                              size="sm"
                              tone="flow"
                            />
                          ) : (
                            <span className="text-[12px] text-ink-4">—</span>
                          )}
                        </TD>
                        <TD numeric>
                          <Money cents={sale.grossProfitCents} size="sm" tone="flow" />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </div>

            <MobileList>
              {customer.sales.map((sale) => (
                <MobileRow key={sale.id}>
                  <Link
                    href={`/sales/${sale.id}` as Route}
                    className="flex flex-col gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <MobileRowHeader>
                      <span className="min-w-0">
                        <span className="tabular block text-[13px] text-ink">
                          {sale.number}
                        </span>
                        <span className="block text-[12px] text-ink-3">
                          {formatDate(sale.soldAt)}
                        </span>
                      </span>
                      <Badge
                        tone={
                          sale.paymentStatus
                            ? PAYMENT_TONE[sale.paymentStatus]
                            : STATUS_TONE[sale.status as keyof typeof STATUS_TONE]
                        }
                        className="shrink-0"
                      >
                        {sale.paymentStatus
                          ? PAYMENT_LABELS[sale.paymentStatus]
                          : humanise(sale.status)}
                      </Badge>
                    </MobileRowHeader>
                    <MobileRowMeta>
                      <MobileRowMetaItem label="Revenue">
                        <Money cents={sale.totalUsdCents} size="sm" />
                      </MobileRowMetaItem>
                      {sale.balanceCents > 0 ? (
                        <MobileRowMetaItem label="Owed">
                          <Money
                            cents={sale.balanceCents}
                            currency={sale.currency}
                            size="sm"
                            tone="flow"
                          />
                        </MobileRowMetaItem>
                      ) : null}
                      <MobileRowMetaItem label="Gross">
                        <Money cents={sale.grossProfitCents} size="sm" tone="flow" />
                      </MobileRowMetaItem>
                    </MobileRowMeta>
                  </Link>
                </MobileRow>
              ))}
            </MobileList>
          </>
        )}
      </Surface>

      {warrantyItems.length > 0 ? (
        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Warranty"
            hint="Items bought with a serial · expiry counts from the day of sale"
          />
          <div className="hidden lg:block">
            <TableWrap>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Serial</TH>
                    <TH>Product</TH>
                    <TH>Sold</TH>
                    <TH>Expires</TH>
                    <TH numeric>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {warrantyItems.map((item) => (
                    <TR key={`${item.saleId}-${item.serial}`}>
                      <TD className="tabular whitespace-nowrap text-ink">{item.serial}</TD>
                      <TD className="text-[12px] whitespace-nowrap text-ink-2">
                        {item.productName} · {item.variantName}
                      </TD>
                      <TD className="text-[12px] whitespace-nowrap">
                        <Link
                          href={`/sales/${item.saleId}` as Route}
                          className="text-ink-3 hover:text-accent hover:underline"
                        >
                          {formatDate(item.soldAt)} · {item.saleNumber}
                        </Link>
                      </TD>
                      <TD className="tabular text-[12px] whitespace-nowrap text-ink-3">
                        {item.expiresAt ? formatDate(item.expiresAt) : '—'}
                      </TD>
                      <TD numeric>
                        <Badge tone={WARRANTY_TONE[item.state]}>
                          {WARRANTY_LABELS[item.state]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </div>
          <MobileList>
            {warrantyItems.map((item) => (
              <MobileRow key={`${item.saleId}-${item.serial}`} interactive={false}>
                <MobileRowHeader>
                  <span className="min-w-0">
                    <span className="tabular block truncate text-[13px] text-ink">
                      {item.serial}
                    </span>
                    <span className="block truncate text-[11px] text-ink-4">
                      {item.productName} · {item.variantName}
                    </span>
                  </span>
                  <Badge tone={WARRANTY_TONE[item.state]} className="shrink-0">
                    {WARRANTY_LABELS[item.state]}
                  </Badge>
                </MobileRowHeader>
                <p className="mt-1 text-[11px] text-ink-4">
                  <Link
                    href={`/sales/${item.saleId}` as Route}
                    className="hover:text-accent hover:underline"
                  >
                    {formatDate(item.soldAt)} · {item.saleNumber}
                  </Link>
                  {' · '}
                  {item.expiresAt ? `expires ${formatDate(item.expiresAt)}` : 'no warranty'}
                </p>
              </MobileRow>
            ))}
          </MobileList>
        </Surface>
      ) : null}
    </div>
  );
}

const WARRANTY_TONE: Record<WarrantyState, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  covered: 'positive',
  expiring: 'warning',
  expired: 'negative',
  none: 'neutral',
};

const WARRANTY_LABELS: Record<WarrantyState, string> = {
  covered: 'Covered',
  expiring: 'Expiring soon',
  expired: 'Expired',
  none: 'No warranty',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  money,
  tone,
}: {
  label: string;
  value?: string;
  money?: number;
  tone?: 'default' | 'flow' | 'muted';
}) {
  return (
    <Surface className="p-4">
      <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <div className="mt-1">
        {money !== undefined ? (
          <Money cents={money} size="lg" tone={tone} />
        ) : (
          <span className="tabular text-[15px] text-ink">{value}</span>
        )}
      </div>
    </Surface>
  );
}
