import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Wordmark } from '@/components/shell/wordmark';
import { whatsappDigits } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

// The footer shows this year, not a frozen build-time year. `use cache` keeps
// the prerender static under Cache Components (an uncached `new Date()` in the
// layout would block prerendering every storefront page).
async function currentYear(): Promise<number> {
  'use cache';
  return new Date().getFullYear();
}

/**
 * The public storefront.
 *
 * A separate route group from the dashboard on purpose: no auth guard, no
 * sidebar, no member context — and no cost figure anywhere, because the
 * queries behind these pages (`server/queries/catalog.ts`) never select one.
 * Forced light, because a public shop that is near-black because of an
 * admin's saved preference is a conversion problem.
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
  const settings = await getSettings();
  const year = await currentYear();
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const waDigits = whatsappDigits(settings?.whatsapp);

  return (
    <ThemeProvider forcedTheme="light">
      <div className="flex min-h-dvh flex-col">
        <header className="border-line-subtle border-b">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 lg:px-6">
            <Link
              href="/"
              className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Wordmark />
            </Link>
            <Link
              href="/login"
              className="rounded-control text-[13px] text-ink-3 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Sign in
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-6">{children}</main>

        <footer className="border-line-subtle border-t bg-sunken">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-6">
            <div className="min-w-0">
              <Wordmark />
              <p className="mt-3 max-w-[40ch] text-[13px] text-ink-3 leading-relaxed">
                {settings?.businessName ?? 'Nextly'} — connected devices, imported and sold in
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
        </footer>
      </div>
    </ThemeProvider>
  );
}
