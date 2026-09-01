import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

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

export function TD({ className, numeric, ...props }: CellProps) {
  return (
    <td
      className={cn('h-8 px-3 text-ink-2', numeric && 'tabular text-right text-ink', className)}
      {...props}
    />
  );
}
