'use client';

import { Search, X } from 'lucide-react';
import { parseAsString, useQueryStates } from 'nuqs';
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/**
 * The client half of a list page — search and filter controls. Sort and
 * pagination stay plain server-rendered `<Link>`s (`ui/table.tsx`'s
 * `THSort`, `ui/pagination.tsx`); only text search and filter selects need
 * a client boundary at all, since only they write on every keystroke or
 * every change rather than on navigation.
 *
 * Wraps its children in a flex row; render a `ListSearch` and any number of
 * `ListFilter`s inside.
 */
export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-line-subtle border-b p-3">
      {children}
    </div>
  );
}

/**
 * Free-text search, bound to `?q=`. Throttled so a keystroke does not fire a
 * navigation per character, and `shallow: false` so the *server* re-renders
 * — that round trip is the entire mechanism, there is no client-side
 * filtering to fall back on.
 */
export function ListSearch({ placeholder = 'Search' }: { placeholder?: string }) {
  const [{ q }, setState] = useQueryStates(
    { q: parseAsString.withDefault(''), page: parseAsString },
    { shallow: false, throttleMs: 300, history: 'replace' },
  );

  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-4" />
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        onChange={(event) => {
          const value = event.target.value;
          // A filter change always returns to page 1 — staying on page 7 of
          // a list that now has 2 pages is the classic bug this avoids.
          setState({ q: value || null, page: null });
        }}
        className={cn(
          'h-8 w-full rounded-control border border-line bg-raised py-1.5 pr-7 pl-8 text-[13px] text-ink',
          'placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        )}
      />
      {q ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setState({ q: null, page: null })}
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-control text-ink-4 hover:bg-hover hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** A single-select filter bound to an arbitrary param name, writing on
 *  every change rather than throttled — a select fires far less often than
 *  a keystroke, so there is nothing to batch. */
export function ListFilter({
  param,
  label,
  options,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const [state, setState] = useQueryStates(
    { [param]: parseAsString, page: parseAsString },
    { shallow: false, history: 'replace' },
  );
  const value = state[param] ?? '';

  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setState({ [param]: next || null, page: null });
      }}
      className="h-8 w-auto min-w-[120px] text-[12px]"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
