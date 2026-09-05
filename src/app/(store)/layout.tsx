import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { StoreFooterBanner } from '@/components/store/store-hero';
import { whatsappDigits } from '@/lib/whatsapp';
import { listCatalogCategories } from '@/server/queries/catalog';
import { getSettings } from '@/server/queries/reference';

// The footer shows this year, not a frozen build-time year. `use cache` keeps
// the prerender static under Cache Components (an uncached `new Date()` in the
// layout would block prerendering every storefront page).
async function currentYear(): Promise<number> {
  'use cache';
  return new Date().getFullYear();
}

/**
 * The public storefront — the "Northlight" skin (see tokens.css).
 *
 * A separate route group from the dashboard on purpose: no auth guard, no
 * sidebar, no member context — and no cost figure anywhere, because the
 * queries behind these pages (`server/queries/catalog.ts`) never select one.
 *
 * Forced light with an explicit background, not a second `next-themes`
 * provider: nothing in the storefront calls `useTheme()`, and nesting a
 * second `attribute="class"` provider inside the root one (dashboard-wide,
 * system-aware) previously caused exactly the bug it was meant to prevent —
 * both instances fight over `document.documentElement`'s class, and on
 * mount the *outer* one's effect runs after the inner one's and wins, so a
 * visitor with OS-level dark mode got `.dark` back on `<html>` regardless.
 * Since `<body>` sits outside `.nx-store`'s scope, its background then
 * followed `.dark`'s near-black value and showed through any store section
 * with no background of its own — a public shop reading as near-black
 * because of a visitor's OS preference is exactly the conversion problem
 * this was meant to avoid. `.nx-store`'s own light values apply regardless
 * of `.dark` on an ancestor (CSS inheritance, not `next-themes`), so the
 * real fix is just giving this root its own opaque light background
 * (`bg-base`) so nothing can show through it in the first place.
 *
 * The shell takes Fairphone's structure: one calm bar with the mark and the
 * catalogue's own sections, content on white, and a closing navy promise
 * above the legal strip. The `.nx-store` class on the root re-skins every
 * token utility inside — the dashboard keeps Instrument untouched.
 */

// The dashboard is noindex; the store is the one part of this app that
// exists to be found.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};
// Settings are live database data used by the storefront footer. With a
// production database configured, leaving this segment as an instant route
// makes Next.js reject the uncached read during prerendering. The catalog grid
// remains streamed where it is wrapped in Suspense; this flag only makes the
// shared store shell wait for its live settings read.
export const instant = false;

/** An Instagram handle or full URL → a profile URL. */
function instagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [settings, categories, year] = await Promise.all([
    getSettings(),
    listCatalogCategories(),
    currentYear(),
  ]);
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const waDigits = whatsappDigits(settings?.whatsapp);
  return (
    <div className="nx-store flex min-h-dvh flex-col bg-base text-ink">
      <header className="border-line-subtle border-b bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 lg:px-6">
          <Link
            href="/"
            className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Wordmark />
          </Link>
          <nav aria-label="Catalog sections" className="hidden items-center gap-1 md:flex">
            {categories.slice(0, 4).map((category) => (
              <Link
                key={category.slug}
                href={`/?category=${category.slug}`}
                className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {category.name}
              </Link>
            ))}
            <Link
              href="/#catalog"
              className="rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              All products
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-full bg-store-bright px-4 py-1.5 text-[13px] font-semibold text-store-navy transition-[filter] duration-150 ease-out-instrument hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:inline-flex"
              >
                WhatsApp us
              </a>
            ) : null}
            <Link
              href="/login"
              className="rounded-control text-[13px] text-ink-3 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full flex-1">{children}</main>

      <footer>
        <StoreFooterBanner />
        <div className="border-line-subtle border-t bg-sunken">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-6">
            <div className="min-w-0">
              <Wordmark />
              <p className="mt-3 max-w-[40ch] text-[13px] text-ink-3 leading-relaxed">
                {settings?.businessName ?? 'Nextly'} imports and sells connected devices in
                Paramaribo. What shows as in stock is on the shelf right now.
              </p>
            </div>

            <div className="text-[13px]">
              <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                Visit
              </h2>
              <ul className="space-y-1 text-ink-3">
                {address ? <li>{address}</li> : null}
                {settings?.openingHours ? <li>{settings.openingHours}</li> : null}
                {!address && !settings?.openingHours ? <li>Paramaribo, Suriname</li> : null}
              </ul>
            </div>

            <div className="text-[13px]">
              <h2 className="mb-2 font-medium text-[11px] text-ink-4 uppercase tracking-[0.08em]">
                Get in touch
              </h2>
              <ul className="space-y-1 text-ink-3">
                {settings?.phone ? (
                  <li>
                    <a
                      href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}
                      className="transition-colors hover:text-accent"
                    >
                      {settings.phone}
                    </a>
                  </li>
                ) : null}
                {waDigits ? (
                  <li>
                    <a
                      href={`https://wa.me/${waDigits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-accent"
                    >
                      WhatsApp
                    </a>
                  </li>
                ) : null}
                {settings?.email ? (
                  <li>
                    <a
                      href={`mailto:${settings.email}`}
                      className="transition-colors hover:text-accent"
                    >
                      {settings.email}
                    </a>
                  </li>
                ) : null}
                {settings?.instagram ? (
                  <li>
                    <a
                      href={instagramUrl(settings.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-accent"
                    >
                      Instagram
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
          <div className="border-line-subtle border-t">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-[12px] text-ink-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <p>
                © {year} {settings?.businessName ?? 'Nextly'}
              </p>
              <p className="tabular">Prices in USD, shown in SRD at the current rate</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
