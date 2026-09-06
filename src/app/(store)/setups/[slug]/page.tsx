import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { getCatalogBundle } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const bundle = await getCatalogBundle((await params).slug);
  return bundle ? { title: bundle.name, description: bundle.summary ?? undefined } : { title: 'Setups' };
}

export default async function SetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const bundle = await getCatalogBundle((await params).slug);
  if (!bundle) notFound();

  const [rate, settings] = await Promise.all([getCurrentRate(), getSettings()]);
  const inStock = bundle.availability > 0;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
      {bundle.storefrontImageUrl ? (
        <div className="store-field relative mb-7 aspect-[16/9] overflow-hidden">
          <Image src={bundle.storefrontImageUrl} alt={bundle.name} fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-contain p-8" />
        </div>
      ) : null}
      <p className="text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">Starter setup</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">{bundle.name}</h1>
      {bundle.summary ? <p className="mt-2 text-ink-3">{bundle.summary}</p> : null}
      <div className="mt-5"><StorePrice usdCents={bundle.priceCents} srdRate={rate?.rateMicros} size="xl" /></div>
      <p className="mt-2 text-[13px] text-ink-3">{inStock ? `${bundle.availability} setup${bundle.availability === 1 ? '' : 's'} available` : 'Currently unavailable'}</p>
      <div className="mt-4"><WhatsAppCta number={settings?.whatsapp} label={inStock ? 'Order this setup' : 'Ask about this setup'} message={`Hi Nextly, I’d like to ${inStock ? 'order' : 'ask about'} the ${bundle.name} setup.`} /></div>

      {bundle.bestFor.length ? <section className="mt-8 border-t border-line-subtle pt-5"><h2 className="font-medium text-ink">Best for</h2><ul className="mt-3 flex flex-wrap gap-2">{bundle.bestFor.map((item) => <li key={item} className="rounded-control bg-hover px-2.5 py-1 text-[12px] text-ink-2">{item}</li>)}</ul></section> : null}
      {bundle.description ? <section className="mt-8 border-t border-line-subtle pt-5"><h2 className="font-medium text-ink">About this setup</h2><p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{bundle.description}</p></section> : null}

      <section className="mt-8 border-t border-line-subtle pt-5"><h2 className="font-medium text-ink">Included items</h2><ul className="mt-3 divide-y divide-line-subtle border-y border-line-subtle">{bundle.items.map((item) => <li key={`${item.productName}-${item.variantName}`} className="flex justify-between py-3 text-[13px]"><span>{item.productName} · {item.variantName}</span><span className="text-ink-3">×{item.quantity}</span></li>)}</ul></section>
      {bundle.compatibilityNotes ? <p className="mt-6 text-[13px] text-ink-2"><strong>Compatibility.</strong> {bundle.compatibilityNotes}</p> : null}
      {bundle.nextlyTake ? <p className="mt-4 border-l-2 border-store-bright pl-4 text-[13px] text-ink-2"><strong>Nextly’s take.</strong> {bundle.nextlyTake}</p> : null}
    </article>
  );
}
