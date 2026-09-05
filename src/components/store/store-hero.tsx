import Link from 'next/link';
import { Suspense } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { getSettings } from '@/server/queries/reference';

/**
 * The catalog hero — the Fairphone opening move.
 *
 * A split hero with the newest product's photo was tried and reverted —
 * direct feedback was that a product photo up top felt out of place and the
 * two-column layout didn't read as intentional on mobile. Centered claim,
 * two actions, catalogue underneath: the wash (`store-hero-field`) carries
 * the visual interest instead of a literal photo.
 */
export function StoreHero() {
  return (
    <section className="store-hero-field mb-10 w-full px-4 pt-16 pb-14 lg:px-6 lg:pt-20 lg:pb-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-white/70 px-3 py-1 text-[11px] font-semibold text-accent tracking-[0.06em] uppercase backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-store-bright" aria-hidden="true" />
          Smart home · Paramaribo, Suriname
        </span>
        <h1 className="mt-5 text-[34px] font-semibold text-ink leading-[1.06] tracking-[-0.03em] sm:text-[46px] lg:text-[54px]">
          Switch to smart.
          <br />
          <span className="text-accent">Switch to Nextly.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[54ch] text-[15px] text-ink-2 leading-relaxed sm:text-[16px]">
          Connected devices for your home, imported and stocked in Paramaribo. What shows as in
          stock is on the shelf right now, priced in SRD and ready to collect today.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
            business runs on. If the card says in stock, it is physically here in Paramaribo.
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
              No checkout maze. Ask, order and collect in one WhatsApp message.
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
