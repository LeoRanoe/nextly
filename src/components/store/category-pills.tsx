'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Category navigation as Fairphone-style pills.
 *
 * The same `?category=` URL state `ListFilter` writes — so the pills, the
 * select on small screens and back/forward all stay in sync — rendered as
 * a pill row instead of a dropdown because on a storefront the categories
 * ARE the navigation, and a dropdown hides them.
 */
export function CategoryPills({
  categories,
}: {
  categories: { slug: string; name: string; count: number }[];
}) {
  const [{ category }, setState] = useQueryStates(
    { category: parseAsString, page: parseAsString },
    { shallow: false, history: 'replace' },
  );
  const active = category ?? '';

  return (
    <div
      role="tablist"
      aria-label="Filter by category"
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
    >
      <Pill active={active === ''} onClick={() => setState({ category: null, page: null })}>
        Everything
      </Pill>
      {categories.map((cat) => (
        <Pill
          key={cat.slug}
          active={active === cat.slug}
          onClick={() =>
            setState({ category: active === cat.slug ? null : cat.slug, page: null })
          }
        >
          {cat.name}
          <span
            className={cn(
              'tabular text-[11px]',
              active === cat.slug ? 'text-white/70' : 'text-ink-4',
            )}
          >
            {cat.count}
          </span>
        </Pill>
      ))}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium whitespace-nowrap',
        'transition-colors duration-150 ease-out-instrument',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active
          ? 'bg-accent text-accent-fg'
          : 'border border-line bg-raised text-ink-2 hover:border-line-strong hover:bg-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
