import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The stacked alternative to a `<Table>`, for the tables with too many
 * columns to stay legible once they have to scroll horizontally on a phone.
 *
 * Convention: a page renders both, one hidden by the breakpoint —
 *
 * ```tsx
 * <div className="hidden lg:block"><TableWrap><Table>…</Table></TableWrap></div>
 * <MobileList>{rows.map((row) => <MobileRow key={row.id}>…</MobileRow>)}</MobileList>
 * ```
 *
 * `lg` rather than `sm`/`md`: these tables commonly carry seven or more
 * columns, and a tablet-width table of that shape is still a table nobody
 * can read without scrolling sideways.
 */
export function MobileList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('divide-y divide-line-subtle lg:hidden', className)} {...props} />;
}

export function MobileRow({
  className,
  interactive = true,
  ...props
}: ComponentProps<'li'> & { interactive?: boolean }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-2 px-4 py-3.5 text-[13px]',
        interactive && 'transition-colors active:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

/** The row's headline — what the desktop table's first column carries —
 *  paired with whatever belongs at the right edge: a status badge, a price,
 *  an actions menu. */
export function MobileRowHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-start justify-between gap-3', className)} {...props} />;
}

/** The row's supporting facts as label/value pairs, two per line — a SKU
 *  next to a quantity next to a date reads as a receipt, not a run-on
 *  sentence the way cramming them into one line of text would. */
export function MobileRowMeta({ className, ...props }: ComponentProps<'dl'>) {
  return (
    <dl
      className={cn('grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]', className)}
      {...props}
    />
  );
}

export function MobileRowMetaItem({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] text-ink-4 uppercase tracking-[0.06em]">{label}</dt>
      <dd className="truncate text-ink-2">{children}</dd>
    </div>
  );
}
