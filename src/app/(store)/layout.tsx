import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/shell/wordmark';

/**
 * The public storefront.
 *
 * A separate route group from the dashboard on purpose: no auth guard, no
 * sidebar, no member context — and no cost figure anywhere, because the
 * queries behind these pages (`server/queries/catalog.ts`) never select one.
 * Same tokens, same type, so the store reads as the same company.
 */

// The dashboard is noindex; the store is the one part of this app that
// exists to be found.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-subtle border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 lg:px-6">
          <Link
            href="/catalog"
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

      <footer className="border-line-subtle border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-[12px] text-ink-4 lg:px-6 sm:flex-row sm:items-center sm:justify-between">
          <p>Nextly · Paramaribo, Suriname</p>
          <p className="tabular">Prices in USD, shown in SRD at the current rate</p>
        </div>
      </footer>
    </div>
  );
}
