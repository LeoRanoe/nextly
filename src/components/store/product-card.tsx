import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import type { RateMicros } from '@/lib/fx';
import type { CatalogListItem } from '@/server/queries/catalog';

/**
 * One product in the storefront grid.
 *
 * Carries the same discipline as the dashboard: hairline border for
 * elevation, semantic colour only where it means something (availability),
 * money always tabular. The image holds a 4:3 field so the grid stays calm
 * whether a product has photography yet or not.
 */
export function ProductCard({
  product,
  srdRate,
}: {
  product: CatalogListItem;
  srdRate?: RateMicros;
}) {
  const inStock = product.onHand > 0;
  const hasRange = product.maxPriceCents > product.minPriceCents;

  return (
    <Link
      href={`/catalog/${product.slug}` as Route}
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
          <Badge tone={inStock ? 'positive' : 'negative'}>
            {inStock ? 'In stock' : 'Out of stock'}
          </Badge>
        </div>

        {product.summary ? (
          <p className="line-clamp-2 text-[12px] text-ink-3 leading-relaxed">
            {product.summary}
          </p>
        ) : null}

        <div className="mt-auto flex items-end gap-1.5 pt-2">
          {hasRange ? <span className="pb-0.5 text-[11px] text-ink-4">from</span> : null}
          <Money cents={product.minPriceCents} srdRate={srdRate} className="items-start" />
        </div>

        {product.categoryName ? (
          <p className="text-[11px] text-ink-4">{product.categoryName}</p>
        ) : null}
      </div>
    </Link>
  );
}
