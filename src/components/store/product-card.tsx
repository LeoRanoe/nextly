import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { RateMicros } from '@/lib/fx';
import type { CatalogListItem } from '@/server/queries/catalog';
import { StorePrice } from './store-price';
import { WhatsAppCta } from './whatsapp-cta';

/** Products created within this window carry the Fairphone-style NEW flag. */
const NEW_WINDOW_DAYS = 30;

function isRecent(iso: string): boolean {
  const created = Date.parse(iso);
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * One product in the storefront grid — the Fairphone card, in Northlight.
 *
 * The whole Fairphone move in one component: the product floats on a soft
 * colour FIELD (`store-field`, a light-blue wash) instead of chrome, a NEW
 * flag marks recent arrivals, the name and a one-line promise sit under it,
 * and the price closes the tile. No hairline boxes, no dense ledger feel —
 * open, cool and light, because this half of the app sells.
 *
 * Availability stays a quiet pill over the image (Fairphone's "Out of
 * stock" does exactly this), and the WhatsApp CTA remains the conversion
 * action (P0-10): a visitor can act without leaving the card.
 */
export function ProductCard({
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
  const isNew = isRecent(product.createdAt);

  return (
    <Link
      href={`/p/${product.slug}` as Route}
      className="store-card group flex flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="store-field relative aspect-[4/3] overflow-hidden">
        {/* Availability pill floats over the field, Fairphone-style. */}
        <span
          className={`absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase ${
            inStock
              ? 'bg-white/85 text-accent backdrop-blur-sm'
              : 'bg-store-navy/80 text-white backdrop-blur-sm'
          }`}
        >
          {inStock ? `${product.onHand} in stock` : 'Sold out'}
        </span>
        {isNew && inStock ? (
          <span className="absolute top-3 right-3 z-10 rounded-full bg-store-bright px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-store-navy uppercase">
            New
          </span>
        ) : null}
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-6 transition-transform duration-300 ease-out-instrument group-hover:scale-[1.04]"
            {...(product.image.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
              : {})}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Package className="size-9 text-ink-4" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-5 pt-4">
        {product.categoryName ? (
          <p className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
            {product.categoryName}
          </p>
        ) : null}
        <p className="text-[15px] font-semibold text-ink leading-snug tracking-[-0.01em]">
          {product.name}
        </p>
        {product.summary ? (
          <p className="line-clamp-2 text-[13px] text-ink-3 leading-relaxed">
            {product.summary}
          </p>
        ) : null}

        <div className="mt-auto pt-3">
          <StorePrice
            usdCents={product.minPriceCents}
            srdRate={srdRate}
            size="md"
            prefix={hasRange ? 'from' : undefined}
          />
        </div>
        <WhatsAppCta
          number={whatsapp}
          message={`Hallo Nextly, ik ben geïnteresseerd in ${product.name}${
            inStock ? ' — is het op voorraad?' : ' — wanneer komt de volgende levering?'
          }`}
          label={inStock ? 'Ask on WhatsApp' : 'Ask about restock'}
          size="md"
          stopPropagation
          className="mt-2 self-stretch rounded-full"
        />
      </div>
    </Link>
  );
}
