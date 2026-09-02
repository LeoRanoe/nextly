import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ReturnSheet } from '@/components/forms/return-sheet';
import { SaleActions } from '@/components/forms/row-actions';
import { SaleForm } from '@/components/forms/sale-form';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatRelative, humanise } from '@/lib/format';
import { formatRate, RATE_SCALE } from '@/lib/fx';
import { formatMoney, toDecimalString } from '@/lib/money';
import { PAYMENT_LABELS, type PaymentBadgeCode, paymentBadgeOf } from '@/lib/payment-status';
import { listActivity } from '@/server/queries/activity';
import { getSale } from '@/server/queries/documents';
import { getCurrentRate } from '@/server/queries/overview';
import { listCustomerOptions, listVariantOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Sale' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;
const PAYMENT_TONE: Record<PaymentBadgeCode, 'positive' | 'warning' | 'info' | 'negative'> = {
  paid: 'positive',
  partly: 'info',
  unpaid: 'warning',
  overdue: 'negative',
};

type SearchParams = Promise<{ editing?: string }>;

export default function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return (
    <>
      <PageHeader
        title="Sale"
        description="Priced and costed at the rate in force when it happened. Neither an FX change nor a later purchase can rewrite this margin."
        action={
          <Button asChild variant="ghost">
            <Link href="/sales">Back</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-[420px] rounded-card" />}>
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
  const [sale, activity] = await Promise.all([
    getSale(id),
    listActivity({ entityType: 'sale', entityId: id }),
  ]);

  if (!sale) notFound();

  if (editing === '1' && sale.status === 'draft') {
    const [variants, customers, rate] = await Promise.all([
      listVariantOptions(),
      listCustomerOptions(),
      getCurrentRate(),
    ]);

    return (
      <SaleForm
        variants={variants}
        customers={customers}
        rateMicros={rate?.rateMicros ?? RATE_SCALE}
        initial={{
          id: sale.id,
          customerId: sale.customerId,
          soldAt: sale.soldAt.slice(0, 10),
          currency: sale.currency,
          paymentMethod: sale.paymentMethod,
          notes: sale.notes ?? '',
          discount: toDecimalString(sale.discountCents, sale.currency),
          discountReason: sale.discountReason ?? '',
          items: sale.items.map((item) => ({
            variantId: item.variantId,
            quantity: String(item.quantity),
            unitPrice: toDecimalString(item.unitPriceCents, sale.currency),
            serials: item.serials.join('\n'),
          })),
        }}
      />
    );
  }

  const marginRate = sale.totalUsdCents === 0 ? 0 : sale.grossProfitCents / sale.totalUsdCents;
  const discountUsdCents = Math.round((sale.discountCents * sale.fxRateMicros) / RATE_SCALE);
  const subtotalUsdCents = sale.totalUsdCents + discountUsdCents;

  /** Derived, never stored (F-4): the badge answers "has the money arrived",
   *  which is a different question from "did the sale happen" that the status
   *  badge beside it answers. Drafts and voids owe nothing, so they get none. */
  const paymentBadge =
    sale.status === 'confirmed'
      ? paymentBadgeOf(sale.totalCents, sale.paidCents, new Date(sale.soldAt))
      : null;
  const balanceCents = Math.max(0, sale.totalCents - sale.paidCents);

  return (
    <div className="space-y-4">
      <Surface>
        <SurfaceHeader
          title={
            <span className="inline-flex items-center gap-2">
              <span className="tabular">{sale.number}</span>
              <Badge tone={STATUS_TONE[sale.status]}>{humanise(sale.status)}</Badge>
              {paymentBadge ? (
                <Badge tone={PAYMENT_TONE[paymentBadge]}>{PAYMENT_LABELS[paymentBadge]}</Badge>
              ) : null}
            </span>
          }
          hint={
            sale.customerId ? (
              <Link
                href={`/customers/${sale.customerId}` as Route}
                className="hover:text-accent hover:underline"
              >
                {sale.customerName}
              </Link>
            ) : (
              (sale.customerName ?? 'Walk-in customer')
            )
          }
          action={
            <span className="inline-flex items-center gap-1">
              {sale.status !== 'void' ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/invoice/${sale.id}` as Route}>Invoice</Link>
                </Button>
              ) : null}
              {sale.status === 'draft' ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/sales/${sale.id}?editing=1` as Route}>Edit</Link>
                </Button>
              ) : null}
              {sale.status === 'confirmed' ? (
                <ReturnSheet
                  saleId={sale.id}
                  number={sale.number}
                  currency={sale.currency}
                  items={sale.items.map((item) => ({
                    id: item.id,
                    label: `${item.productName} · ${item.variantName}`,
                    sku: item.sku,
                    quantity: item.quantity,
                    quantityReturned: item.quantityReturned,
                    unitPriceCents: item.unitPriceCents,
                  }))}
                />
              ) : null}
              <SaleActions
                id={sale.id}
                number={sale.number}
                status={sale.status}
                totalCents={sale.totalCents}
                paidCents={sale.paidCents}
                currency={sale.currency}
                paymentStatus={paymentBadge}
              />
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Field label="Sold" value={formatDate(sale.soldAt)} />
          <Field label="Currency" value={sale.currency} />
          <Field label="Rate" value={`1 USD = ${formatRate(sale.fxRateMicros, 2)} SRD`} />
          <Field label="Payment" value={humanise(sale.paymentMethod)} />
          {sale.status === 'confirmed' ? (
            <>
              <Field label="Total" value={formatMoney(sale.totalCents, sale.currency)} />
              <Field label="Paid" value={formatMoney(sale.paidCents, sale.currency)} />
              <Field
                label="Balance"
                value={balanceCents > 0 ? formatMoney(balanceCents, sale.currency) : 'Settled'}
              />
            </>
          ) : null}
        </div>
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
                  <TH numeric>Qty</TH>
                  <TH numeric>Unit price</TH>
                  <TH numeric>Line total</TH>
                  <TH numeric>Cost</TH>
                  <TH numeric>Margin</TH>
                </TR>
              </THead>
              <TBody>
                {sale.items.map((item) => {
                  const lineMargin =
                    item.lineTotalUsdCents === 0
                      ? 0
                      : (item.lineTotalUsdCents - item.cogsCents) / item.lineTotalUsdCents;
                  return (
                    <TR key={item.id}>
                      <TD className="whitespace-nowrap text-ink">
                        {item.productName}
                        <span className="text-ink-4"> · {item.variantName}</span>
                        {item.shortfall > 0 ? (
                          <Badge tone="warning" className="ml-2">
                            {item.shortfall} oversold
                          </Badge>
                        ) : null}
                        {item.quantityReturned > 0 ? (
                          <Badge tone="info" className="ml-2">
                            {item.quantityReturned} returned
                          </Badge>
                        ) : null}
                        {item.serials.length > 0 ? (
                          <span className="tabular block text-[11px] text-ink-4">
                            {item.serials.join(' · ')}
                          </span>
                        ) : null}
                      </TD>
                      <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                        {item.sku}
                      </TD>
                      <TD numeric className="text-ink-3">
                        {item.quantity}
                      </TD>
                      <TD numeric>
                        <Money cents={item.unitPriceUsdCents} size="sm" tone="muted" />
                      </TD>
                      <TD numeric>
                        <Money cents={item.lineTotalUsdCents} size="sm" />
                      </TD>
                      <TD numeric>
                        <Money cents={item.cogsCents} size="sm" tone="muted" />
                      </TD>
                      <TD numeric>
                        <Percent value={lineMargin} tone="flow" />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
              <tfoot className="border-line-subtle border-t bg-inset/60">
                {sale.discountCents > 0 ? (
                  <tr>
                    <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                      Subtotal{sale.discountReason ? ` · ${sale.discountReason}` : ''}
                    </td>
                    <td className="h-9 px-3 text-right">
                      <Money cents={subtotalUsdCents} size="sm" tone="muted" />
                    </td>
                    <td className="h-9 px-3" />
                    <td className="h-9 px-3" />
                  </tr>
                ) : null}
                <tr>
                  <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                    {sale.discountCents > 0 ? 'Discount' : 'Totals'}
                  </td>
                  <td className="h-9 px-3 text-right">
                    {sale.discountCents > 0 ? (
                      <span className="text-[12px] text-ink-3">
                        −<Money cents={discountUsdCents} size="sm" tone="muted" />
                      </span>
                    ) : null}
                  </td>
                  <td className="h-9 px-3" />
                  <td className="h-9 px-3" />
                </tr>
                <tr>
                  <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                    Totals
                  </td>
                  <td className="h-9 px-3 text-right">
                    <Money cents={sale.totalUsdCents} size="sm" />
                  </td>
                  <td className="h-9 px-3 text-right">
                    <Money cents={sale.cogsCents} size="sm" tone="muted" />
                  </td>
                  <td className="h-9 px-3 text-right">
                    <Percent value={marginRate} tone="flow" />
                  </td>
                </tr>
              </tfoot>
            </Table>
          </TableWrap>
        </div>

        <MobileList>
          {sale.items.map((item) => {
            const lineMargin =
              item.lineTotalUsdCents === 0
                ? 0
                : (item.lineTotalUsdCents - item.cogsCents) / item.lineTotalUsdCents;
            return (
              <MobileRow key={item.id} interactive={false}>
                <MobileRowHeader>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">
                      {item.productName}
                      <span className="text-ink-4"> · {item.variantName}</span>
                    </span>
                    <span className="tabular block text-[11px] text-ink-4">{item.sku}</span>
                    {item.serials.length > 0 ? (
                      <span className="tabular block text-[11px] text-ink-4">
                        {item.serials.join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <Money cents={item.lineTotalUsdCents} size="sm" className="shrink-0" />
                </MobileRowHeader>
                {item.shortfall > 0 || item.quantityReturned > 0 ? (
                  <span className="flex gap-1.5">
                    {item.shortfall > 0 ? (
                      <Badge tone="warning">{item.shortfall} oversold</Badge>
                    ) : null}
                    {item.quantityReturned > 0 ? (
                      <Badge tone="info">{item.quantityReturned} returned</Badge>
                    ) : null}
                  </span>
                ) : null}
                <MobileRowMeta>
                  <MobileRowMetaItem label="Qty">{item.quantity}</MobileRowMetaItem>
                  <MobileRowMetaItem label="Unit price">
                    <Money cents={item.unitPriceUsdCents} size="sm" tone="muted" />
                  </MobileRowMetaItem>
                  <MobileRowMetaItem label="Cost">
                    <Money cents={item.cogsCents} size="sm" tone="muted" />
                  </MobileRowMetaItem>
                  <MobileRowMetaItem label="Margin">
                    <Percent value={lineMargin} tone="flow" />
                  </MobileRowMetaItem>
                </MobileRowMeta>
              </MobileRow>
            );
          })}
          {sale.discountCents > 0 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-2 text-[12px] text-ink-3">
              <span>Discount{sale.discountReason ? ` · ${sale.discountReason}` : ''}</span>
              <span>
                −<Money cents={discountUsdCents} size="sm" tone="muted" />
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-[12px] text-ink-3">
            <span>Total</span>
            <span className="flex items-center gap-3">
              <Money cents={sale.totalUsdCents} size="sm" />
              <Percent value={marginRate} tone="flow" />
            </span>
          </div>
        </MobileList>
      </Surface>

      {sale.status === 'confirmed' && sale.payments.length > 0 ? (
        <Surface className="overflow-hidden">
          <SurfaceHeader
            title="Payments"
            hint="Each payment posted its own receipt to the cash ledger when it was recorded"
          />
          <div className="divide-y divide-line-subtle">
            {sale.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-[13px] text-ink-2">
                  {humanise(payment.method)}
                  {payment.notes ? (
                    <span className="text-ink-4"> · {payment.notes}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] text-ink-4">
                    {formatDate(payment.receivedAt)}
                  </span>
                  <span className="text-[13px] text-positive">
                    {formatMoney(payment.amountCents, sale.currency)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="overflow-hidden">
          <SurfaceHeader title="Posted" hint="What this sale caused, traceable back to it" />
          {sale.ledgerEntries.length === 0 && sale.movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-4">
              Nothing posted — still a draft.
            </p>
          ) : (
            <div className="divide-y divide-line-subtle">
              {sale.ledgerEntries.map((entry) => (
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
              {sale.movements.map((movement) => (
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
