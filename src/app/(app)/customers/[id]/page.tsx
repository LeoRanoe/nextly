import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CustomerActions } from '@/components/forms/row-actions';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatRelative, humanise } from '@/lib/format';
import { getCustomer } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Customer' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;

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
  const customer = await getCustomer(id);

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

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Orders" value={String(customer.orderCount)} />
        <Stat label="Lifetime spend" money={customer.spentCents} />
        <Stat label="Gross earned" money={customer.grossCents} tone="flow" />
      </div>

      <Surface className="overflow-hidden">
        <SurfaceHeader title="Order history" />
        {customer.sales.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-4">No sales yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Number</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH numeric>Revenue</TH>
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
                      <Badge tone={STATUS_TONE[sale.status as keyof typeof STATUS_TONE]}>
                        {humanise(sale.status)}
                      </Badge>
                    </TD>
                    <TD numeric>
                      <Money cents={sale.totalUsdCents} size="sm" />
                    </TD>
                    <TD numeric>
                      <Money cents={sale.grossProfitCents} size="sm" tone="flow" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Surface>
    </div>
  );
}

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
