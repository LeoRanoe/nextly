import { formatDate, humanise } from '@/lib/format';
import { formatRate } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import type { SettingsRow } from '@/server/queries/reference';

export type InvoicePaperItem = {
  id?: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
};

export type InvoicePaperSale = {
  number: string;
  invoiceNumber: string | null;
  status: string;
  customerName: string | null;
  currency: 'USD' | 'SRD';
  fxRateMicros: number;
  totalCents: number;
  discountCents: number;
  discountReason: string | null;
  paymentMethod: string;
  soldAt: string;
  dueAt: string | null;
  notes: string | null;
  items: InvoicePaperItem[];
};

export function InvoicePaper({
  sale,
  settings,
}: {
  sale: InvoicePaperSale;
  settings: SettingsRow | null;
}) {
  const currency = sale.currency;
  const subtotalCents = sale.totalCents + sale.discountCents;
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');

  return (
    <article className="invoice rounded-card border border-line bg-raised p-8 shadow-raised">
      <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
        <div className="min-w-0">
          {settings?.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: arbitrary-dimension remote blob logo; this route is printed, not performance-critical.
            <img src={settings.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
          ) : null}
          <p className="text-[15px] font-semibold">{settings?.businessName ?? 'Nextly'}</p>
          {settings?.legalName && settings.legalName !== settings.businessName ? (
            <p className="text-[12px] text-ink-3">{settings.legalName}</p>
          ) : null}
          <div className="mt-1 space-y-0.5 text-[12px] text-ink-3">
            {address ? <p>{address}</p> : null}
            {settings?.phone ? <p>Tel {settings.phone}</p> : null}
            {settings?.email ? <p>{settings.email}</p> : null}
            {settings?.taxId ? <p>Tax / BTW {settings.taxId}</p> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-ink-4 uppercase tracking-[0.08em]">
            Invoice / Factuur
          </p>
          <p className="tabular mt-1 text-[18px] font-semibold">
            {sale.invoiceNumber ?? sale.number}
          </p>
          <p className="tabular mt-1 text-[12px] text-ink-3">{formatDate(sale.soldAt)}</p>
          <p className="text-[12px] text-ink-3">{humanise(sale.status)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 border-b border-line py-6 text-[13px]">
        <div>
          <p className="text-[11px] text-ink-4 uppercase tracking-[0.08em]">Billed to</p>
          <p className="mt-1 text-ink">{sale.customerName ?? 'Walk-in customer'}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-4 uppercase tracking-[0.08em]">Payment</p>
          <p className="mt-1 text-ink">{humanise(sale.paymentMethod)}</p>
          {sale.dueAt ? (
            <p className="tabular text-[12px] text-ink-3">
              Due / Vervalt {formatDate(sale.dueAt)}
            </p>
          ) : null}
          {currency === 'SRD' ? (
            <p className="tabular text-[12px] text-ink-3">
              Rate 1 USD = {formatRate(sale.fxRateMicros, 2)} SRD
            </p>
          ) : null}
        </div>
      </section>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] text-ink-4 uppercase tracking-[0.06em]">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Unit price</th>
            <th className="py-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => {
            const lineTotalCents = item.unitPriceCents * item.quantity;
            return (
              <tr
                key={item.id ?? `${item.sku}-${item.quantity}-${item.unitPriceCents}`}
                className="border-b border-line-subtle align-top"
              >
                <td className="py-2.5 pr-3">
                  <span className="text-ink">{item.productName}</span>
                  <span className="text-ink-4"> · {item.variantName}</span>
                  <span className="tabular block text-[11px] text-ink-4">{item.sku}</span>
                </td>
                <td className="tabular px-3 py-2.5 text-right text-ink-2">{item.quantity}</td>
                <td className="tabular px-3 py-2.5 text-right text-ink-2">
                  {formatMoney(item.unitPriceCents, currency, { bare: true })}
                </td>
                <td className="tabular py-2.5 pl-3 text-right text-ink">
                  {formatMoney(lineTotalCents, currency, { bare: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-full max-w-[320px] space-y-1.5 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-3">Subtotal</dt>
          <dd className="tabular text-ink">{formatMoney(subtotalCents, currency)}</dd>
        </div>
        {sale.discountCents > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">
              Discount{sale.discountReason ? ` · ${sale.discountReason}` : ''}
            </dt>
            <dd className="tabular text-negative">
              −{formatMoney(sale.discountCents, currency)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-line pt-2 text-[15px]">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="tabular font-semibold text-ink">
            {formatMoney(sale.totalCents, currency)}
          </dd>
        </div>
      </dl>

      {sale.notes ? (
        <p className="mt-6 whitespace-pre-line border-t border-line pt-4 text-[12px] text-ink-3">
          {sale.notes}
        </p>
      ) : null}
      {settings?.invoiceFooter ? (
        <footer className="mt-6 whitespace-pre-line border-t border-line pt-4 text-center text-[11px] text-ink-4">
          {settings.invoiceFooter}
        </footer>
      ) : null}
    </article>
  );
}
