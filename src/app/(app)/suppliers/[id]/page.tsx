import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SupplierActions } from '@/components/forms/row-actions';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { getSupplier } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Supplier' };

const STATUS_TONE = {
  draft: 'neutral',
  ordered: 'info',
  shipped: 'accent',
  received: 'positive',
  cancelled: 'negative',
} as const;

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageHeader
        title="Supplier"
        description="Landed spend is the total of every received order from here — freight and fees included, not just the goods."
        action={
          <Button asChild variant="ghost">
            <Link href="/suppliers">Back</Link>
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
  const supplier = await getSupplier(id);

  if (!supplier) notFound();

  return (
    <div className="space-y-4">
      <Surface>
        <SurfaceHeader
          title={
            <span className="inline-flex items-center gap-2">
              {supplier.name}
              <Badge>{humanise(supplier.kind)}</Badge>
            </span>
          }
          hint={supplier.website || undefined}
          action={
            <SupplierActions
              id={supplier.id}
              name={supplier.name}
              kind={supplier.kind}
              website={supplier.website}
              notes={supplier.notes}
              productCount={supplier.productCount}
              orderCount={supplier.orderCount}
            />
          }
        />
        {supplier.notes ? (
          <div className="px-4 py-3">
            <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Notes</p>
            <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{supplier.notes}</p>
          </div>
        ) : null}
      </Surface>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Products" value={String(supplier.productCount)} />
        <Stat label="Orders" value={String(supplier.orderCount)} />
        <Stat label="Landed spend" money={supplier.spendCents} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="overflow-hidden">
          <SurfaceHeader title="Products sourced here" />
          {supplier.products.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-4">
              No products from this supplier yet.
            </p>
          ) : (
            <div className="divide-y divide-line-subtle">
              {supplier.products.map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.id}` as Route}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-hover"
                >
                  <span className="text-[13px] text-ink">{product.name}</span>
                  <span className="tabular text-[12px] text-ink-4">{product.code}</span>
                </Link>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Purchase orders" />
          {supplier.purchaseOrders.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-4">
              No purchase orders yet.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Number</TH>
                    <TH>Ordered</TH>
                    <TH>Status</TH>
                    <TH numeric>Landed</TH>
                  </TR>
                </THead>
                <TBody>
                  {supplier.purchaseOrders.map((order) => (
                    <TR key={order.id}>
                      <TD className="tabular whitespace-nowrap text-ink">
                        <Link
                          href={`/purchase-orders/${order.id}` as Route}
                          className="hover:text-accent hover:underline"
                        >
                          {order.number}
                        </Link>
                      </TD>
                      <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                        {formatDate(order.orderedAt)}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[order.status as keyof typeof STATUS_TONE]}>
                          {humanise(order.status)}
                        </Badge>
                      </TD>
                      <TD numeric>
                        <Money cents={order.totalCents} size="sm" />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Surface>
      </div>
    </div>
  );
}

function Stat({ label, value, money }: { label: string; value?: string; money?: number }) {
  return (
    <Surface className="p-4">
      <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <div className="mt-1">
        {money !== undefined ? (
          <Money cents={money} size="lg" />
        ) : (
          <span className="tabular text-[15px] text-ink">{value}</span>
        )}
      </div>
    </Surface>
  );
}
