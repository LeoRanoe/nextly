import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentActions } from '@/components/invoice/document-actions';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { getPublicQuote } from '@/server/queries/quotes';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Quote / Offerte',
  robots: { index: false, follow: false },
};
export const instant = false;

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [quote, settings] = await Promise.all([getPublicQuote(token), getSettings()]);
  if (!quote) notFound();
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 text-ink">
      <DocumentActions />
      <article className="invoice rounded-card border border-line bg-raised p-8 shadow-raised">
        <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            {settings?.logoUrl ? (
              // biome-ignore lint/performance/noImgElement: this print view keeps the stored logo self-contained.
              <img src={settings.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : null}
            <p className="text-[15px] font-semibold">{settings?.businessName ?? 'Nextly'}</p>
            <div className="mt-1 text-[12px] text-ink-3">
              {address ? <p>{address}</p> : null}
              {settings?.phone ? <p>{settings.phone}</p> : null}
              {settings?.email ? <p>{settings.email}</p> : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-4">
              Quote / Offerte
            </p>
            <p className="tabular mt-1 text-[18px] font-semibold">{quote.number}</p>
            <p className="tabular mt-1 text-[12px] text-ink-3">
              Valid until {formatDate(quote.validUntil)}
            </p>
          </div>
        </header>
        <section className="border-b border-line py-6 text-[13px]">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-4">
            Prepared for / Voor
          </p>
          <p className="mt-1">{quote.customerName}</p>
          <p className="text-ink-3">{quote.customerContact}</p>
        </section>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.06em] text-ink-4">
              <th className="py-2 pr-3">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="py-2 pl-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr
                key={`${item.sku}-${item.productName}`}
                className="border-b border-line-subtle"
              >
                <td className="py-2.5 pr-3">
                  {item.productName}
                  {item.variantName ? ` · ${item.variantName}` : ''}
                  {item.sku ? (
                    <span className="tabular block text-[11px] text-ink-4">{item.sku}</span>
                  ) : null}
                </td>
                <td className="tabular px-3 py-2.5 text-right">{item.quantity}</td>
                <td className="tabular px-3 py-2.5 text-right">
                  {formatMoney(item.unitPriceCents, quote.currency, { bare: true })}
                </td>
                <td className="tabular py-2.5 pl-3 text-right">
                  {formatMoney(item.lineTotalCents, quote.currency, { bare: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 w-full max-w-[320px] space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-ink-3">Subtotal</dt>
            <dd>{formatMoney(quote.subtotalCents, quote.currency)}</dd>
          </div>
          {quote.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-ink-3">Discount</dt>
              <dd>−{formatMoney(quote.discountCents, quote.currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
            <dt>Total / Totaal</dt>
            <dd>{formatMoney(quote.totalCents, quote.currency)}</dd>
          </div>
        </dl>
        {quote.notes ? (
          <p className="mt-6 whitespace-pre-line border-t border-line pt-4 text-[12px] text-ink-3">
            {quote.notes}
          </p>
        ) : null}
      </article>
    </main>
  );
}
