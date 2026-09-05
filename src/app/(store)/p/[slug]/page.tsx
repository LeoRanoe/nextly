import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { QuoteRequestForm } from '@/components/forms/quote-request-form';
import { RestockRequestForm } from '@/components/forms/restock-request-form';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getCatalogProduct } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) return { title: 'Catalog' };

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.summary ?? undefined,
  };
}

export default function CatalogProductPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-10 lg:px-6">
          <Skeleton className="h-[480px] rounded-card" />
        </div>
      }
    >
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, rate, settings] = await Promise.all([
    getCatalogProduct(slug),
    getCurrentRate(),
    getSettings(),
  ]);

  // The query already filters to published, active products: a slug that is
  // not in the catalog is simply not here.
  if (!product) notFound();

  const srdRate = rate?.rateMicros;
  const whatsapp = settings?.whatsapp ?? null;
  // Aggregate range excludes unpriced (draft) variants — same rule as the
  // grid's LATERAL in queries/catalog.ts. The Options list below still shows
  // every variant's own price untouched, zero included: that is real
  // per-variant data broken out, not a headline figure.
  const pricedVariants = product.variants
    .map((variant) => variant.listPriceCents)
    .filter((cents) => cents > 0);
  const minPrice = pricedVariants.length > 0 ? Math.min(...pricedVariants) : 0;
  const maxPrice = pricedVariants.length > 0 ? Math.max(...pricedVariants) : 0;
  const onHand = product.variants.reduce((total, variant) => total + variant.onHand, 0);
  const inStock = onHand > 0;
  const paragraphs = product.description
    ? product.description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const specs = Object.entries(product.specs);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.seoDescription ?? product.summary ?? undefined,
    sku: product.code,
    image: product.images.map((image) => image.url),
    brand: product.brandName
      ? { '@type': 'Brand', name: product.brandName }
      : undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: (minPrice / 100).toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  // Product fields are editable by staff. Escaping '<' prevents a catalog
  // value containing </script> from terminating the JSON-LD script element.
  const jsonLdText = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-10 lg:px-6">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be emitted as a script element; the serialised value escapes '<' above.
        dangerouslySetInnerHTML={{ __html: jsonLdText }}
      />
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-1.5 text-[12px] text-ink-4"
      >
        <Link href="/" className="rounded-control transition-colors hover:text-accent">
          Catalog
        </Link>
        {product.categoryName ? (
          <>
            <span aria-hidden="true">/</span>
            {product.categorySlug ? (
              <Link
                href={`/?category=${product.categorySlug}`}
                className="rounded-control text-ink-3 transition-colors hover:text-accent"
              >
                {product.categoryName}
              </Link>
            ) : (
              <span className="text-ink-3">{product.categoryName}</span>
            )}
          </>
        ) : null}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {product.images.map((image, index) => (
            <div
              key={image.url}
              className={
                index === 0
                  ? 'store-field relative aspect-square overflow-hidden rounded-[16px]'
                  : 'store-field relative aspect-[4/3] overflow-hidden rounded-[16px]'
              }
            >
              <Image
                src={image.url}
                alt={image.alt ?? product.name}
                fill
                sizes={
                  index === 0
                    ? '(max-width: 1024px) 100vw, 55vw'
                    : '(max-width: 1024px) 100vw, 27vw'
                }
                priority={index === 0}
                className="object-contain p-6"
                {...(image.blurDataUrl
                  ? { placeholder: 'blur' as const, blurDataURL: image.blurDataUrl }
                  : {})}
              />
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] ${
                inStock ? 'text-accent' : 'text-ink-3'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${inStock ? 'bg-store-bright' : 'bg-ink-4'}`}
                aria-hidden="true"
              />
              {inStock
                ? `${onHand} in stock, collect today`
                : 'Sold out, ask about the next shipment'}
            </span>
            <span className="tabular text-[11px] text-ink-4">{product.code}</span>
          </div>

          {product.brandName || product.categoryName ? (
            <p className="mt-3 text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
              {[product.brandName, product.categoryName].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <h1
            className={`text-[28px] font-semibold text-ink leading-tight tracking-[-0.02em] ${
              product.categoryName ? 'mt-1' : 'mt-3'
            }`}
          >
            {product.name}
          </h1>

          {product.summary ? (
            <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">{product.summary}</p>
          ) : null}

          <div className="mt-4">
            <StorePrice
              usdCents={minPrice}
              srdRate={srdRate}
              size="xl"
              prefix={maxPrice > minPrice ? 'from' : undefined}
            />
          </div>

          <div className="mt-4">
            <WhatsAppCta
              number={whatsapp}
              message={`Hallo Nextly, ik ben geïnteresseerd in ${product.name}${
                product.variants.length === 1 ? ` (${product.variants[0]?.name})` : ''
              }${product.code ? ` (SKU ${product.code})` : ''}`}
              label={inStock ? 'Order on WhatsApp' : 'Ask about restock'}
              className="h-11 rounded-full px-6 text-[14px]"
            />
          </div>

          {/* F-5: the alternative channel for visitors who would rather type an
              enquiry than open WhatsApp. The form files a quote request against
              this product; owners answer it from /quotes. */}
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-[12px] text-ink-3 underline-offset-4 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              Or request a quote by email
            </summary>
            <div className="mt-3">
              <QuoteRequestForm productId={product.id} productName={product.name} />
            </div>
          </details>

          {!inStock && product.restockNotificationsEnabled ? (
            <section className="mt-4 border-t border-line-subtle pt-4">
              <h2 className="text-[14px] font-semibold text-ink">Notify me when it’s back</h2>
              <p className="mt-1 text-[12px] text-ink-3">We’ll keep your request for the Nextly team. Nothing is sent automatically.</p>
              <RestockRequestForm productId={product.id} />
            </section>
          ) : null}

          {product.compatibility.platforms.length || product.compatibility.protocols.length || product.compatibility.ecosystems.length ? (
            <section className="mt-6 border-t border-line-subtle pt-5">
              <h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Compatibility</h2>
              <Compatibility label="Works with" values={[...product.compatibility.platforms, ...product.compatibility.ecosystems]} />
              <Compatibility label="Connection" values={product.compatibility.protocols} />
            </section>
          ) : null}

          {Object.keys(product.buyerRequirements).length > 0 ? <Requirements values={product.buyerRequirements} /> : null}
          {product.keyFeatures.length ? <ListSection title="Key features" values={product.keyFeatures} /> : null}
          {product.nextlyTake ? <section className="mt-6 border-l-2 border-store-bright pl-4"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Nextly’s take</h2><p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{product.nextlyTake}</p></section> : null}
          {product.boxContents.length ? <ListSection title="What’s in the box" values={product.boxContents} /> : null}
          {product.faqItems.length ? <section className="mt-6 border-t border-line-subtle pt-5"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Questions answered</h2><dl className="mt-3 divide-y divide-line-subtle border-y border-line-subtle">{product.faqItems.map((item) => <div key={item.question} className="py-3"><dt className="text-[13px] font-medium text-ink">{item.question}</dt><dd className="mt-1 text-[13px] leading-relaxed text-ink-2">{item.answer}</dd></div>)}</dl></section> : null}
          <GettingOrder settings={settings} />

          {paragraphs.length > 0 ? (
            <div className="mt-5 space-y-3">
              {paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 48)}
                  className="text-[13px] text-ink-2 leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}

          {product.variants.length > 1 ? (
            <section className="mt-6">
              <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                Options
              </h2>
              <ul className="divide-y divide-line-subtle overflow-hidden rounded-card border border-line-subtle bg-raised">
                {product.variants.map((variant) => (
                  <li
                    key={variant.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="text-[13px] text-ink">{variant.name}</span>
                    <span className="flex items-center gap-3">
                      <Badge tone={variant.onHand > 0 ? 'positive' : 'neutral'}>
                        {variant.onHand > 0 ? `${variant.onHand} in stock` : 'Sold out'}
                      </Badge>
                      <StorePrice
                        usdCents={variant.listPriceCents}
                        size="md"
                        srdRate={srdRate}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {specs.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                Specifications
              </h2>
              <dl className="divide-y divide-line-subtle overflow-hidden rounded-card border border-line-subtle bg-raised">
                {specs.map(([name, value]) => (
                  <div
                    key={name}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 px-4 py-2.5"
                  >
                    <dt className="text-[12px] text-ink-3">{name}</dt>
                    <dd className="text-[13px] text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {product.related.length ? <section className="mt-8 border-t border-line-subtle pt-5"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Works well with</h2><div className="mt-3 space-y-2">{product.related.map((item) => <Link key={`${item.relationshipType}-${item.slug}`} href={`/p/${item.slug}`} className="block text-[13px] text-ink hover:text-accent hover:underline"><span className="font-medium">{item.name}</span>{item.summary ? <span className="text-ink-3"> · {item.summary}</span> : null}</Link>)}</div></section> : null}
        </div>
      </div>
    </article>
  );
}

function Compatibility({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return <div className="mt-3"><p className="mb-1.5 text-[12px] text-ink-3">{label}</p><div className="flex flex-wrap gap-1.5">{values.map((value) => <span key={value} className="rounded-control border border-line px-2 py-1 text-[11px] text-ink">{value}</span>)}</div></div>;
}
function ListSection({ title, values }: { title: string; values: string[] }) { return <section className="mt-6"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">{title}</h2><ul className="mt-2 space-y-1 text-[13px] text-ink-2">{values.map((value) => <li key={value}>• {value}</li>)}</ul></section>; }
function GettingOrder({ settings }: { settings: Awaited<ReturnType<typeof getSettings>> }) { const methods = settings?.paymentMethods ?? []; if (!settings?.pickupEnabled && !settings?.deliveryEnabled && !methods.length) return null; return <section className="mt-6 border-t border-line-subtle pt-5"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Getting your order</h2>{settings?.pickupEnabled ? <p className="mt-2 text-[13px] text-ink-2"><strong>Pickup.</strong> {[settings.pickupLabel, settings.pickupDetails, settings.sameDayPickupEnabled ? `Same-day pickup${settings.pickupCutoffTime ? ` before ${settings.pickupCutoffTime}` : ''}.` : null].filter(Boolean).join(' ')}</p> : null}{settings?.deliveryEnabled ? <p className="mt-2 text-[13px] text-ink-2"><strong>Delivery.</strong> {[settings.deliveryDetails, settings.deliveryAreas, settings.deliveryFeeDisplay, settings.deliveryEstimateDisplay].filter(Boolean).join(' ')}</p> : null}{methods.length ? <p className="mt-2 text-[13px] text-ink-2"><strong>Payment.</strong> {methods.map((method) => method.details ? `${method.name} (${method.details})` : method.name).join(' · ')}</p> : null}</section>; }
function Requirements({ values }: { values: Record<string, unknown> }) {
  const labels: Record<string, string> = { hubRequired: 'Hub required', hubName: 'Hub', appRequired: 'App required', appName: 'App', wifiRequired: 'Wi-Fi required', wifiBands: 'Wi-Fi bands', subscription: 'Subscription', indoorOutdoor: 'Use', powerSource: 'Power', batteryType: 'Battery', installationNotes: 'Installation', regionalNotes: 'Regional notes' };
  const entries = Object.entries(values).filter(([key, value]) => labels[key] && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0));
  if (!entries.length) return null;
  return <section className="mt-6 border-t border-line-subtle pt-5"><h2 className="font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">Before you buy</h2><dl className="mt-2 space-y-1.5">{entries.map(([key, value]) => <div key={key} className="grid grid-cols-[110px_1fr] gap-2 text-[12px]"><dt className="text-ink-3">{labels[key]}</dt><dd className="text-ink">{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd></div>)}</dl></section>;
}
