import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ReceiveOrderSheet } from '@/components/forms/finance-sheets';
import { PurchaseOrderForm } from '@/components/forms/purchase-order-form';
import { PurchaseOrderActions } from '@/components/forms/row-actions';
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
import { formatRate } from '@/lib/fx';
import { formatMoney, toDecimalString } from '@/lib/money';
import { listActivity } from '@/server/queries/activity';
import { getPurchaseOrder } from '@/server/queries/documents';
import { listSupplierOptions, listVariantOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Purchase order' };

const STATUS_TONE = {
  draft: 'neutral',
  ordered: 'info',
  shipped: 'accent',
  received: 'positive',
  cancelled: 'negative',
} as const;

type SearchParams = Promise<{ editing?: string }>;

export default function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return (
    <>
      <PageHeader
        title="Purchase order"
        description="Freight, tax and card fees are costs of the goods. On receipt they are allocated across the order's lines pro-rata by value — this page is where that allocation is shown, not just totalled."
        action={
          <Button asChild variant="ghost">
            <Link href="/purchase-orders">Back</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[480px] rounded-card" />}>
        <Loader params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Loader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, { editing }] = await Promise.all([params, searchParams]);
  const [order, activity] = await Promise.all([
    getPurchaseOrder(id),
    listActivity({ entityType: 'purchase_order', entityId: id }),
  ]);

  if (!order) notFound();

  const editable =
    order.status === 'draft' || order.status === 'ordered' || order.status === 'shipped';

  if (editing === '1' && editable) {
    const [variants, suppliers] = await Promise.all([
      listVariantOptions(),
      listSupplierOptions(),
    ]);

    return (
      <PurchaseOrderForm
        variants={variants}
        suppliers={suppliers}
        initial={{
          id: order.id,
          supplierId: order.supplierId,
          orderedAt: (order.orderedAt ?? '').slice(0, 10),
          expectedAt: (order.expectedAt ?? '').slice(0, 10),
          reference: order.reference ?? '',
          notes: order.notes ?? '',
          taxCents: toDecimalString(order.taxCents),
          cardFeeCents: toDecimalString(order.cardFeeCents),
          deliveryCents: toDecimalString(order.deliveryCents),
          shippingCents: toDecimalString(order.shippingCents),
          shippingTaxCents: toDecimalString(order.shippingTaxCents),
          items: order.items.map((item) => ({
            variantId: item.variantId,
            quantity: String(item.quantity),
            subtotal: toDecimalString(item.subtotalCents),
          })),
        }}
      />
    );
  }

  const goodsCents = order.items.reduce((sum, item) => sum + item.subtotalCents, 0);
  const overheadTotal =
    order.taxCents +
    order.cardFeeCents +
    order.deliveryCents +
    order.shippingCents +
    order.shippingTaxCents;
  const unitCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const landedTotal = order.items.reduce((sum, item) => sum + item.landedCostCents, 0);
  const canReceive = order.status === 'ordered' || order.status === 'shipped';

  return (
    <div className="space-y-4">
      <Surface>
        <SurfaceHeader
          title={
            <span className="inline-flex items-center gap-2">
              <span className="tabular">{order.number}</span>
              <Badge tone={STATUS_TONE[order.status]}>{humanise(order.status)}</Badge>
            </span>
          }
          hint={
            order.supplierId ? (
              <Link
                href={`/suppliers/${order.supplierId}` as Route}
                className="hover:text-accent hover:underline"
              >
                {order.supplierName}
              </Link>
            ) : (
              (order.supplierName ?? 'No supplier')
            )
          }
          action={
            <span className="inline-flex items-center gap-1">
              {editable ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/purchase-orders/${order.id}?editing=1` as Route}>Edit</Link>
                </Button>
              ) : null}
              {canReceive ? (
                <ReceiveOrderSheet
                  orderId={order.id}
                  orderNumber={order.number}
                  goodsCents={goodsCents}
                  overheadCents={overheadTotal}
                  unitCount={unitCount}
                />
              ) : null}
              <PurchaseOrderActions id={order.id} number={order.number} status={order.status} />
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Field label="Ordered" value={formatDate(order.orderedAt)} />
          <Field label="Expected" value={formatDate(order.expectedAt)} />
          <Field label="Received" value={formatDate(order.receivedAt)} />
          <Field label="Rate" value={`1 USD = ${formatRate(order.fxRateMicros, 2)} SRD`} />
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <Surface>
          <SurfaceHeader title="Overhead" hint="Allocated across lines pro-rata by value" />
          <dl className="divide-y divide-line-subtle">
            <Row label="Tax" value={order.taxCents} />
            <Row label="Card fee" value={order.cardFeeCents} />
            <Row label="Delivery" value={order.deliveryCents} />
            <Row label="Shipping" value={order.shippingCents} />
            <Row label="Shipping tax" value={order.shippingTaxCents} />
            <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="text-[13px] text-ink">Total</dt>
              <dd className="tabular text-[13px] text-ink">{formatMoney(overheadTotal)}</dd>
            </div>
          </dl>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Items" />
          <div className="hidden lg:block">
            <TableWrap>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Product</TH>
                    <TH>SKU</TH>
                    <TH numeric>Ordered</TH>
                    <TH numeric>Received</TH>
                    <TH numeric>Subtotal</TH>
                    <TH numeric>Overhead</TH>
                    <TH numeric>Landed</TH>
                    <TH numeric>Per unit</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((item) => (
                    <TR key={item.id}>
                      <TD className="whitespace-nowrap text-ink">
                        {item.productName}
                        <span className="text-ink-4"> · {item.variantName}</span>
                      </TD>
                      <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                        {item.sku}
                      </TD>
                      <TD numeric className="text-ink-3">
                        {item.quantity}
                      </TD>
                      <TD numeric className="text-ink-3">
                        {item.quantityReceived}
                      </TD>
                      <TD numeric>
                        <Money cents={item.subtotalCents} size="sm" tone="muted" />
                      </TD>
                      <TD numeric>
                        <Money cents={item.overheadCents} size="sm" tone="muted" />
                      </TD>
                      <TD numeric>
                        <Money cents={item.landedCostCents} size="sm" />
                      </TD>
                      <TD numeric className="text-ink-3">
                        {item.quantity > 0
                          ? `$${(item.landedCostCents / item.quantity / 100).toFixed(4)}`
                          : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
                <tfoot className="border-line-subtle border-t bg-inset/60">
                  <tr>
                    <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                      {order.receivedAt
                        ? 'Foots exactly to the order total'
                        : 'Not yet received — overhead not allocated'}
                    </td>
                    <td className="h-9 px-3 text-right">
                      <Money cents={goodsCents} size="sm" tone="muted" />
                    </td>
                    <td className="h-9 px-3 text-right">
                      <Money cents={overheadTotal} size="sm" tone="muted" />
                    </td>
                    <td className="h-9 px-3 text-right" colSpan={2}>
                      <Money cents={landedTotal} size="sm" />
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </TableWrap>
          </div>

          <MobileList>
            {order.items.map((item) => (
              <MobileRow key={item.id} interactive={false}>
                <MobileRowHeader>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">
                      {item.productName}
                      <span className="text-ink-4"> · {item.variantName}</span>
                    </span>
                    <span className="tabular block text-[11px] text-ink-4">{item.sku}</span>
                  </span>
                  <Money cents={item.landedCostCents} size="sm" className="shrink-0" />
                </MobileRowHeader>
                <MobileRowMeta>
                  <MobileRowMetaItem label="Ordered">{item.quantity}</MobileRowMetaItem>
                  <MobileRowMetaItem label="Received">
                    {item.quantityReceived}
                  </MobileRowMetaItem>
                  <MobileRowMetaItem label="Subtotal">
                    <Money cents={item.subtotalCents} size="sm" tone="muted" />
                  </MobileRowMetaItem>
                  <MobileRowMetaItem label="Per unit">
                    {item.quantity > 0
                      ? `$${(item.landedCostCents / item.quantity / 100).toFixed(4)}`
                      : '—'}
                  </MobileRowMetaItem>
                </MobileRowMeta>
              </MobileRow>
            ))}
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[12px] text-ink-3">
              <span>
                {order.receivedAt ? 'Foots exactly to the order total' : 'Not yet received'}
              </span>
              <Money cents={landedTotal} size="sm" />
            </div>
          </MobileList>
        </Surface>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="overflow-hidden">
          <SurfaceHeader title="Posted" hint="What receiving this order caused" />
          {order.ledgerEntries.length === 0 && order.movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-4">
              Nothing posted — not yet received.
            </p>
          ) : (
            <div className="divide-y divide-line-subtle">
              {order.ledgerEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px] text-ink-2">
                    {entry.description}
                  </span>
                  <Money
                    cents={
                      entry.direction === 'in' ? entry.amountUsdCents : -entry.amountUsdCents
                    }
                    size="sm"
                    tone="flow"
                    signed
                  />
                </div>
              ))}
              {order.movements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px] text-ink-2">
                    Stock · <span className="tabular text-ink-3">{movement.sku}</span>
                  </span>
                  <span className="tabular text-[13px] text-ink-3">
                    {movement.quantity > 0 ? '+' : ''}
                    {movement.quantity} units
                  </span>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Activity" />
          {activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-4">
              Nothing recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-line-subtle">
              {activity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-[13px] text-ink-2">
                    {entry.actorName ?? 'Someone'} {entry.action}
                  </span>
                  <span className="whitespace-nowrap text-[12px] text-ink-4">
                    {formatRelative(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
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

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="tabular text-[13px] text-ink-2">{formatMoney(value)}</dd>
    </div>
  );
}
