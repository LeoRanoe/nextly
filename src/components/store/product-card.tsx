import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import type { CatalogListItem } from '@/server/queries/catalog';
import { StorePrice } from './store-price';
import { WhatsAppCta } from './whatsapp-cta';

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
  size = 'default',
}: {
  product: CatalogListItem;
  srdRate?: RateMicros;
  whatsapp: string | null;
  /** `spotlight` is the larger, more spacious format used for the 2-3 item
   *  catalog-spotlight layout (`catalog-spotlight.tsx`) — everything else
   *  renders the standard grid tile unchanged. */
  size?: 'default' | 'spotlight';
}) {
  const inStock = product.onHand > 0;
  const hasRange = product.maxPriceCents > product.minPriceCents;
  const isNew = product.newUntil ? Date.parse(product.newUntil) >= Date.now() : false;
  const spotlight = size === 'spotlight';

  return (
    <div className="store-card group relative flex flex-col overflow-hidden">
      <div
        className={cn(
          'store-field relative overflow-hidden',
          spotlight ? 'aspect-square' : 'aspect-[4/3]',
        )}
      >
        {/* Availability pill floats over the field, Fairphone-style.
         *  `pointer-events-none` so it never steals a click from the card's
         *  stretched link underneath — it's a label, not a control. */}
        <span
          className={`pointer-events-none absolute top-3 left-3 z-10 rounded-control px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase ${
            inStock
              ? 'bg-white/85 text-accent backdrop-blur-sm'
              : 'bg-store-navy/80 text-white backdrop-blur-sm'
          }`}
        >
          {inStock ? `${product.onHand} in stock` : 'Sold out'}
        </span>
        {isNew && inStock ? (
          <span className="pointer-events-none absolute top-3 right-3 z-10 rounded-control bg-store-bright px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] text-store-navy uppercase">
            New
          </span>
        ) : null}
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className={cn(
              'object-contain transition-transform duration-300 ease-out-instrument group-hover:scale-[1.04]',
              spotlight ? 'p-10' : 'p-6',
            )}
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

      <div className={cn('flex flex-1 flex-col gap-1.5', spotlight ? 'p-6 pt-5' : 'p-5 pt-4')}>
        {product.brandName || product.categoryName ? (
          <p className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
            {[product.brandName, product.categoryName].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {/* The card's "stretched link": its own box only wraps the name
         *  text (so the accessible name is the real, visible title), but
         *  `after:absolute after:inset-0` extends its hit area to the
         *  whole card via the nearest positioned ancestor (`.store-card`
         *  above). `WhatsAppCta` below stacks on top of that with its own
         *  `relative z-10` to remain independently clickable. */}
        <Link
          href={`/p/${product.slug}` as Route}
          className={cn(
            'font-semibold text-ink leading-snug tracking-[-0.01em] after:absolute after:inset-0',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            spotlight ? 'text-[17px]' : 'text-[15px]',
          )}
        >
          {product.name}
        </Link>
        {product.summary ? (
          <p className="line-clamp-2 text-[13px] text-ink-3 leading-relaxed">
            {product.summary}
          </p>
        ) : null}
        {product.compatibility.platforms.length || product.compatibility.protocols.length ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {[...product.compatibility.platforms, ...product.compatibility.protocols]
              .slice(0, 3)
              .map((item) => (
                <span
                  key={item}
                  className="rounded-control border border-line px-1.5 py-0.5 text-[10px] text-ink-3"
                >
                  {item}
                </span>
              ))}
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          <StorePrice
            usdCents={product.minPriceCents}
            srdRate={srdRate}
            size={spotlight ? 'lg' : 'md'}
            prefix={hasRange ? 'from' : undefined}
          />
        </div>
        <WhatsAppCta
          number={whatsapp}
          message={`Hallo Nextly, ik ben geïnteresseerd in ${product.name}${
            inStock ? '. Is het op voorraad?' : '. Wanneer komt de volgende levering?'
          }`}
          label={inStock ? 'Ask on WhatsApp' : 'Ask about restock'}
          size="md"
          className={cn('relative z-10 mt-2 self-stretch rounded-full', spotlight && 'h-10')}
        />
      </div>
    </div>
  );
}
