import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { getCatalogProduct } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';

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
    <Suspense fallback={<Skeleton className="h-[480px] rounded-card" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, rate] = await Promise.all([getCatalogProduct(slug), getCurrentRate()]);

  // The query already filters to published, active products: a slug that is
  // not in the catalog is simply not here.
  if (!product) notFound();

  const srdRate = rate?.rateMicros;
  const prices = product.variants.map((variant) => variant.listPriceCents);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const inStock = product.variants.some((variant) => variant.onHand > 0);
  const paragraphs = product.description
    ? product.description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const specs = Object.entries(product.specs);

  return (
    <article>
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
                  ? 'relative aspect-square overflow-hidden rounded-card border border-line-subtle bg-inset'
                  : 'relative aspect-[4/3] overflow-hidden rounded-card border border-line-subtle bg-inset'
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
                className="object-contain p-4"
                {...(image.blurDataUrl
                  ? { placeholder: 'blur' as const, blurDataURL: image.blurDataUrl }
                  : {})}
              />
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={inStock ? 'positive' : 'negative'}>
              {inStock ? 'In stock' : 'Out of stock'}
            </Badge>
            <span className="tabular text-[11px] text-ink-4">{product.code}</span>
          </div>

          <h1 className="mt-2 font-medium text-[22px] text-ink tracking-[-0.02em]">
            {product.name}
          </h1>

          {product.summary ? (
            <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">{product.summary}</p>
          ) : null}

          <div className="mt-4 flex items-end gap-1.5">
            {maxPrice > minPrice ? (
              <span className="pb-1 text-[12px] text-ink-4">from</span>
            ) : null}
            <Money cents={minPrice} size="xl" srdRate={srdRate} className="items-start" />
            {maxPrice > minPrice ? (
              <>
                <span className="pb-1 text-[13px] text-ink-4">–</span>
                <Money cents={maxPrice} size="xl" srdRate={srdRate} className="items-start" />
              </>
            ) : null}
          </div>

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
              <h2 className="mb-2 font-medium text-[11px] text-ink-3 uppercase tracking-[0.08em]">
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
                      <Badge tone={variant.onHand > 0 ? 'positive' : 'negative'}>
                        {variant.onHand > 0 ? 'In stock' : 'Out of stock'}
                      </Badge>
                      <Money cents={variant.listPriceCents} size="sm" srdRate={srdRate} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {specs.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 font-medium text-[11px] text-ink-3 uppercase tracking-[0.08em]">
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
        </div>
      </div>
    </article>
  );
}
