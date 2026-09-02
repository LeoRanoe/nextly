import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { RateMicros } from '@/lib/fx';
import type { CatalogListItem } from '@/server/queries/catalog';
import { StorePrice } from './store-price';
import { WhatsAppCta } from './whatsapp-cta';

/**
 * One product in the storefront grid.
 *
 * Carries the same discipline as the dashboard: hairline border for
 * elevation, semantic colour only where it means something (availability),
 * money always tabular. The image holds a 4:3 field so the grid stays calm
 * whether a product has photography yet or not.
 *
 * Priced SRD-first and closed with a WhatsApp enquiry — a visitor should be
 * able to act without leaving the card (P0-10).
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

  return (
    <Link
      href={`/p/${product.slug}` as Route}
      className="group flex flex-col overflow-hidden rounded-card border border-line-subtle bg-raised shadow-[var(--nx-shadow-raised),inset_0_1px_0_0_var(--nx-highlight)] transition-colors hover:border-line"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-inset">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt ?? product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-3 transition-transform duration-200 ease-out-instrument group-hover:scale-[1.02]"
            {...(product.image.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
              : {})}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Package className="size-8 text-ink-4" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-medium text-[14px] text-ink">{product.name}</p>
          <Badge tone={inStock ? 'positive' : 'neutral'}>
            {inStock ? `${product.onHand} in stock` : 'Sold out'}
          </Badge>
        </div>

        {product.summary ? (
          <p className="line-clamp-2 text-[12px] text-ink-3 leading-relaxed">
            {product.summary}
          </p>
        ) : null}

        <div className="mt-auto pt-2">
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
          size="sm"
          stopPropagation
          className="mt-1 self-stretch"
        />
      </div>
    </Link>
  );
}
