import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Page title block.
 *
 * `meta` is for the one or two facts that qualify the whole page: how many
 * rows, as of when, in which currency. Putting them here rather than in a
 * card keeps the first panel from having to explain itself.
 */
export function PageHeader({
  title,
  description,
  meta,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-medium text-[20px] text-ink tracking-[-0.02em]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-[13px] text-ink-3 leading-relaxed">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-4">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
