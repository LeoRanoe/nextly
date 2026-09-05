import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ProductCard } from '@/components/store/product-card';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import type { RateMicros } from '@/lib/fx';
import type { CatalogListItem } from '@/server/queries/catalog';

/**
 * The catalog grid's small-inventory mode.
 *
 * Forcing 1-3 published products through a grid built for dozens is what
 * makes a young catalog look empty rather than curated — this is the fix.
 * At exactly one product it becomes a full editorial feature (a compact
 * PDP preview); at two or three, an enlarged `ProductCard` row. Once there
 * are enough products, `CatalogGrid` (`(store)/page.tsx`) switches back to
 * the standard responsive grid on its own — this component only ever
 * renders for `products.length <= 3`.
 */
export function CatalogSpotlight({
  products,
  srdRate,
  whatsapp,
}: {
  products: CatalogListItem[];
  srdRate?: RateMicros;
  whatsapp: string | null;
}) {
  const [firstProduct] = products;
  if (products.length === 1 && firstProduct) {
    return <FeaturedProduct product={firstProduct} srdRate={srdRate} whatsapp={whatsapp} />;
  }

  return (
    <div
      className={
        products.length === 2
          ? 'mx-auto grid max-w-3xl gap-6 sm:grid-cols-2'
          : 'mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3'
      }
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          srdRate={srdRate}
          whatsapp={whatsapp}
          size="spotlight"
        />
      ))}
    </div>
  );
}

/** The one-product case: a full-width feature, image beside copy, rather
 *  than a lonely card adrift in grid whitespace. */
function FeaturedProduct({
  product,
  srdRate,
  whatsapp,
}: {
  product: CatalogListItem;
  srdRate?: RateMicros;
  whatsapp: string | null;
}) {
  const inStock = product.onHand > 0;
  const hasRange = product.maxPriceCents > product.minPriceCents;

  return (
    <div className="store-card grid overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="store-field relative aspect-square lg:aspect-auto">
        <span
          className={`absolute top-4 left-4 z-10 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase ${
            inStock
              ? 'bg-white/85 text-accent backdrop-blur-sm'
              : 'bg-store-navy/80 text-white backdrop-blur-sm'
          }`}
        >
          {inStock ? `${product.onHand} in stock` : 'Sold out'}
        </span>
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-12"
            {...(product.image.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
              : {})}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Package className="size-12 text-ink-4" />
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center gap-3 p-8 lg:p-12">
        {product.categoryName ? (
          <p className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
            {product.categoryName}
          </p>
        ) : null}
        <p className="text-[24px] font-semibold text-ink leading-tight tracking-[-0.02em] lg:text-[28px]">
          {product.name}
        </p>
        {product.summary ? (
          <p className="text-[14px] text-ink-3 leading-relaxed">{product.summary}</p>
        ) : null}
        <div className="mt-1">
          <StorePrice
            usdCents={product.minPriceCents}
            srdRate={srdRate}
            size="xl"
            prefix={hasRange ? 'from' : undefined}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <WhatsAppCta
            number={whatsapp}
            message={`Hallo Nextly, ik ben geïnteresseerd in ${product.name}${
              inStock ? '. Is het op voorraad?' : '. Wanneer komt de volgende levering?'
            }`}
            label={inStock ? 'Ask on WhatsApp' : 'Ask about restock'}
            className="h-11 rounded-full px-6 text-[14px]"
          />
          <Link
            href={`/p/${product.slug}` as Route}
            className="text-[13px] text-ink-3 underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            View full details →
          </Link>
        </div>
      </div>
    </div>
  );
}
