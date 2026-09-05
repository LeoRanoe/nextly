import { Package } from 'lucide-react';
import type { Route } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { Skeleton } from '@/components/ui/skeleton';
import { listCatalogProducts } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

/**
 * The catalog hero — the Fairphone opening move, split.
 *
 * Fairphone's homepage doesn't lead with a promise alone — it leads with the
 * phone. This does the same: the claim and the two actions stay on one side,
 * static and prerendered, while the other side is the newest published
 * product itself — a live, clickable preview that rotates automatically as
 * inventory changes, so the hero is never a stock claim disconnected from
 * what's actually on the shelf.
 */
export function StoreHero() {
  return (
    <section className="store-hero-field mb-10 w-full px-4 pt-14 pb-16 lg:px-6 lg:pt-16 lg:pb-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-white/70 px-3 py-1 text-[11px] font-semibold text-accent tracking-[0.06em] uppercase backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-store-bright" aria-hidden="true" />
            Smart home · Paramaribo, Suriname
          </span>
          <h1 className="mt-5 text-[32px] font-semibold text-ink leading-[1.06] tracking-[-0.03em] sm:text-[42px] lg:text-[50px]">
            Switch to smart.
            <br />
            <span className="text-accent">Switch to Nextly.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] text-ink-2 leading-relaxed sm:text-[16px] lg:mx-0">
            Connected devices for your home, imported and stocked in Paramaribo. What shows as
            in stock is on the shelf right now — priced in SRD, ready to collect today.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <a
              href="#catalog"
              className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-[14px] font-medium text-accent-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] transition-colors duration-150 ease-out-instrument hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Browse the catalog
            </a>
            <Suspense fallback={<HeroCtaFallback />}>
              <HeroWhatsApp />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={<HeroProductFallback />}>
          <HeroProduct />
        </Suspense>
      </div>
    </section>
  );
}

async function HeroWhatsApp() {
  const settings = await getSettings();
  return (
    <WhatsAppCta
      number={settings?.whatsapp ?? null}
      message="Hallo Nextly, ik heb een vraag over jullie smart home producten."
      label="Ask us on WhatsApp"
      className="h-11 rounded-full px-6 text-[14px]"
    />
  );
}

/** Same footprint as the pill above it, so streaming causes no shift. A
 *  plain browse link keeps the row honest when no WhatsApp is configured. */
function HeroCtaFallback() {
  return (
    <span className="inline-flex h-11 items-center rounded-full border border-line bg-raised px-6 text-[14px] font-medium text-ink-3">
      Ask us on WhatsApp
    </span>
  );
}

/**
 * The hero's product half — the newest published item, live.
 *
 * Deliberately "newest, limit 1" rather than hand-picked: it needs no
 * maintenance as inventory changes, and it means the headline claim ("what
 * shows as in stock is on the shelf right now") is always illustrated by a
 * real, buyable row instead of stock photography.
 */
async function HeroProduct() {
  const [[product], rate] = await Promise.all([
    listCatalogProducts({ sort: 'newest', limit: 1 }),
    getCurrentRate(),
  ]);

  if (!product) return <HeroProductEmpty />;

  const inStock = product.onHand > 0;
  const hasRange = product.maxPriceCents > product.minPriceCents;

  return (
    <Link
      href={`/p/${product.slug}` as Route}
      className="group mx-auto block w-full max-w-[420px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:mx-0 lg:max-w-none"
    >
      <div className="store-card overflow-hidden">
        <div className="store-field relative aspect-square">
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
              sizes="(max-width: 1024px) 84vw, 40vw"
              priority
              className="object-contain p-10 transition-transform duration-300 ease-out-instrument group-hover:scale-[1.03]"
              {...(product.image.blurDataUrl
                ? { placeholder: 'blur' as const, blurDataURL: product.image.blurDataUrl }
                : {})}
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Package className="size-10 text-ink-4" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 px-1">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
            {product.categoryName ?? 'Just landed'}
          </p>
          <p className="truncate text-[16px] font-semibold text-ink tracking-[-0.01em]">
            {product.name}
          </p>
        </div>
        <StorePrice
          usdCents={product.minPriceCents}
          srdRate={rate?.rateMicros}
          size="md"
          prefix={hasRange ? 'from' : undefined}
          className="shrink-0 items-end text-right"
        />
      </div>
    </Link>
  );
}

/** Geometry-matched to `HeroProduct` — image field, caption row — so
 *  streaming causes no shift. */
function HeroProductFallback() {
  return (
    <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-none" aria-hidden="true">
      <div className="store-card overflow-hidden">
        <Skeleton className="aspect-square w-full rounded-none" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 px-1">
        <div className="space-y-2">
          <Skeleton className="h-[11px] w-20" />
          <Skeleton className="h-[16px] w-32" />
        </div>
        <Skeleton className="h-[18px] w-20" />
      </div>
    </div>
  );
}

/** Same shell as a real product, so an empty catalog never looks like a
 *  broken layout — just an honest "nothing here yet". */
function HeroProductEmpty() {
  return (
    <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-none">
      <div className="store-card overflow-hidden">
        <div className="store-field flex aspect-square flex-col items-center justify-center gap-3 px-10 text-center">
          <Package className="size-9 text-ink-4" aria-hidden="true" />
          <p className="text-[13px] text-ink-3 leading-relaxed">
            New arrivals land here first — nothing published yet.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The value band under the grid — Fairphone's "Built to last / e-waste
 *  neutral / fair factories" triptych, translated to the three promises this
 *  shop can actually keep, as one weighted statement instead of three equal
 *  cards: the strongest promise (real stock) earns real typographic weight,
 *  the other two sit as plain supporting facts. Static: no data, no copy
 *  that can drift from the settings row. */
export function StoreValues() {
  return (
    <section className="mt-16 border-line-subtle border-t pt-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold text-accent tracking-[0.08em] uppercase">
            Real stock
          </p>
          <p className="mt-3 text-[26px] font-semibold text-ink leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
            On the shelf, not on a promise. Availability comes straight from the same ledger the
            business runs on — if the card says in stock, it is physically here in Paramaribo.
          </p>
        </div>

        <dl className="grid gap-6 lg:border-l lg:border-line-subtle lg:pl-10">
          <div>
            <dt className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
              Local prices
            </dt>
            <dd className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">
              Priced in SRD at the current rate, with the USD figure underneath. No surprises at
              the counter.
            </dd>
          </div>
          <div className="border-line-subtle border-t pt-6">
            <dt className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
              One message away
            </dt>
            <dd className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">
              No checkout maze. Ask, order and collect — one WhatsApp message.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** The footer's closing line, Fairphone-style: one promise on the navy
 *  field. Rendered inside the layout footer, above the legal strip. */
export function StoreFooterBanner() {
  return (
    <div className="bg-store-navy">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-store-navy-soft">
            <Wordmark
              size="sm"
              className="[&_span]:hidden [&_svg_path]:stroke-store-bright [&_svg_circle]:fill-store-bright"
            />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              Switch to smart. Switch to Nextly.
            </p>
            <p className="text-[12px] text-white/60">
              Smart home products, imported and in stock in Paramaribo.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-full bg-store-bright px-5 text-[13px] font-semibold text-store-navy transition-[filter] duration-150 ease-out-instrument hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Browse the catalog
        </Link>
      </div>
    </div>
  );
}
