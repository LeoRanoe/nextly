import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Page links for a list, rendered server-side — no client state, no
 * JavaScript required to page through a table. `buildHref` takes a page
 * number and returns the full URL, so the caller decides which other
 * params (search, filters, sort) travel along.
 */
export function Pagination({
  page,
  pageCount,
  total,
  perPage,
  buildHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  buildHref: (page: number) => Route;
}) {
  if (total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-line-subtle border-t px-3 py-2"
    >
      <p className="text-[12px] text-ink-4">
        Showing <span className="tabular text-ink-3">{from}</span>–
        <span className="tabular text-ink-3">{to}</span> of{' '}
        <span className="tabular text-ink-3">{total}</span>
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <PageLink
            href={buildHref(page - 1)}
            disabled={page <= 1}
            label="Previous page"
            Icon={ChevronLeft}
          />
          <span className="tabular px-2 text-[12px] text-ink-3">
            {page} / {pageCount}
          </span>
          <PageLink
            href={buildHref(page + 1)}
            disabled={page >= pageCount}
            label="Next page"
            Icon={ChevronRight}
          />
        </div>
      ) : null}
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  Icon,
}: {
  href: Route;
  disabled: boolean;
  label: string;
  Icon: typeof ChevronLeft;
}) {
  if (disabled) {
    return (
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-control text-ink-4/40"
      >
        <Icon className="size-3.5" />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'grid size-7 place-items-center rounded-control text-ink-3 transition-colors',
        'hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
      )}
    >
      <Icon className="size-3.5" />
    </Link>
  );
}
