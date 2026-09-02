import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InvoiceActions } from '@/components/invoice/invoice-actions';
import { formatDate, humanise } from '@/lib/format';
import { formatRate } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import { requireMember } from '@/server/auth';
import { getSale } from '@/server/queries/documents';
import { getSettings } from '@/server/queries/reference';

/**
 * A print-optimised invoice/receipt for a single sale.
 *
 * Deliberately outside the (app) group: that layout wraps everything in the
 * sidebar/topbar shell and calls requireMember before any child renders, which
 * would put admin chrome around the document and make `window.print()` capture
 * navigation. This route guards itself and renders only the paper.
 *
 * The money shown is the customer's — line totals, subtotal, discount and
 * grand total all in the sale's own currency at the rate recorded on the sale.
 * Cost and margin stay on the admin detail page; a receipt never shows them.
 */
export const metadata: Metadata = { title: 'Invoice' };

// The invoice reads the live sale and business settings directly. It is
// intentionally outside the authenticated app layout, so it must opt out of
// instant prerendering itself when the production database is configured.
export const instant = false;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember();
  const { id } = await params;

  const [sale, settings] = await Promise.all([getSale(id), getSettings()]);
  if (!sale) notFound();

  // Everything below is in the sale's own currency. The USD figures the books
  // keep are irrelevant to a customer receipt; the discount was stored in sale
  // cents, so it needs no re-conversion.
  const currency = sale.currency;
  const subtotalCents = sale.totalCents + sale.discountCents;
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');

  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 text-ink">
      <InvoiceActions
        number={sale.number}
        whatsapp={settings?.whatsapp ?? null}
        totalText={`${formatMoney(sale.totalCents, currency)} ${currency}`}
      />

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
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-4">Invoice</p>
            <p className="tabular mt-1 text-[18px] font-semibold">{sale.number}</p>
            <p className="tabular mt-1 text-[12px] text-ink-3">{formatDate(sale.soldAt)}</p>
            <p className="text-[12px] text-ink-3">{humanise(sale.status)}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-line py-6 text-[13px]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-4">Billed to</p>
            <p className="mt-1 text-ink">{sale.customerName ?? 'Walk-in customer'}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-4">Payment</p>
            <p className="mt-1 text-ink">{humanise(sale.paymentMethod)}</p>
            {currency === 'SRD' ? (
              <p className="tabular text-[12px] text-ink-3">
                Rate 1 USD = {formatRate(sale.fxRateMicros, 2)} SRD
              </p>
            ) : null}
          </div>
        </section>

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-ink-4">
              <th className="py-2 pr-3 font-medium">Item</th>
              <th className="py-2 px-3 text-right font-medium">Qty</th>
              <th className="py-2 px-3 text-right font-medium">Unit price</th>
              <th className="py-2 pl-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => {
              const lineTotalCents = item.unitPriceCents * item.quantity;
              return (
                <tr key={item.id} className="border-b border-line-subtle align-top">
                  <td className="py-2.5 pr-3">
                    <span className="text-ink">{item.productName}</span>
                    <span className="text-ink-4"> · {item.variantName}</span>
                    <span className="tabular block text-[11px] text-ink-4">{item.sku}</span>
                  </td>
                  <td className="tabular py-2.5 px-3 text-right text-ink-2">{item.quantity}</td>
                  <td className="tabular py-2.5 px-3 text-right text-ink-2">
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
    </main>
  );
}
