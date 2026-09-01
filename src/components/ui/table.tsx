import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './skeleton';

/**
 * Tables.
 *
 * Server-rendered markup, not a headless table runtime. These lists are read
 * far more than they are manipulated, and shipping a client-side table library
 * to render rows the server already has is how a dashboard gets slow. Sorting
 * and filtering live in the URL and re-query on the server; TanStack Table
 * earns its place only where a grid needs genuine client-side interaction.
 *
 * Rows are 32px and rules are hairlines. Density is the point: someone should
 * be able to see their whole stock position without scrolling.
 */

export function TableWrap({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead className={cn('border-line-subtle border-b bg-inset/60', className)} {...props} />
  );
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-line-subtle', className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-hover/50', className)} {...props} />;
}

type CellProps = ComponentProps<'td'> & {
  /** Right-align and switch to tabular figures. Use for every number. */
  numeric?: boolean;
};

export function TH({
  className,
  numeric,
  ...props
}: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-8 whitespace-nowrap px-3 text-left font-medium text-[11px] text-ink-4 uppercase tracking-[0.06em]',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A sortable column header — a plain link, so toggling sort needs no
 * JavaScript and composes with `typedRoutes`. `href` is the link this
 * column should point to when clicked (computed by the caller, which is the
 * only place that knows the full query shape); `active`/`dir` control which
 * chevron shows.
 */
export function THSort({
  href,
  active,
  dir,
  numeric,
  children,
}: {
  href: Route;
  active: boolean;
  dir: 'asc' | 'desc';
  numeric?: boolean;
  children: React.ReactNode;
}) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TH numeric={numeric} className="p-0">
      <Link
        href={href}
        className={cn(
          'flex h-8 items-center gap-1 px-3 transition-colors hover:text-ink',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          numeric && 'flex-row-reverse',
        )}
      >
        {children}
        <Icon className={cn('size-3', active ? 'text-ink-3' : 'text-ink-4/60')} />
      </Link>
    </TH>
  );
}

export function TD({ className, numeric, ...props }: CellProps) {
  return (
    <td
      className={cn('h-8 px-3 text-ink-2', numeric && 'tabular text-right text-ink', className)}
      {...props}
    />
  );
}

/** Stable keys for placeholder rows. Skeletons never reorder, but an index
 *  key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROW_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/**
 * Loading placeholder for a list table, matching its final geometry so the
 * page does not shift when data arrives.
 *
 * Every list page had its own copy of this — same wrapper, same header bar,
 * same three-column row shape, differing only in row count and column
 * widths. `widths` takes the first column's, the second's, and the
 * right-aligned last column's Tailwind width class, in that order.
 */
export function TableSkeleton({
  rows = 3,
  widths = ['w-32', 'w-40', 'w-16'],
}: {
  rows?: number;
  widths?: readonly [string, string, string];
}) {
  const [first, second, last] = widths;
  return (
    <div className="divide-y divide-line-subtle">
      <div className="h-8 bg-inset/60" />
      {SKELETON_ROW_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="flex h-8 items-center gap-3 px-3">
          <Skeleton className={cn('h-3', first)} />
          <Skeleton className={cn('h-3', second)} />
          <Skeleton className={cn('ml-auto h-3', last)} />
        </div>
      ))}
    </div>
  );
}
