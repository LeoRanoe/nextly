import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The panel. Every block of content in the dashboard sits in one of these.
 *
 * Elevation is carried by a hairline border plus a single soft shadow in
 * light mode, and by a 1px inner top highlight in dark mode, because drop
 * shadows are invisible against near-black and only add mud.
 */
export function Surface({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line-subtle bg-raised',
        'shadow-[var(--nx-shadow-raised),inset_0_1px_0_0_var(--nx-highlight)]',
        className,
      )}
      {...props}
    />
  );
}

type SurfaceHeaderProps = {
  title: ReactNode;
  /** Sits under the title. Keep it to one short line. */
  hint?: ReactNode;
  /** Right-aligned controls: a filter, a link, a menu. */
  action?: ReactNode;
  className?: string;
};

export function SurfaceHeader({ title, hint, action, className }: SurfaceHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-line-subtle border-b px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate font-medium text-[13px] text-ink tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 truncate text-[12px] text-ink-3">{hint}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </div>
  );
}

export function SurfaceBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />;
}

export function SurfaceFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-line-subtle border-t bg-inset px-4 py-2.5',
        'rounded-b-card text-[12px] text-ink-3',
        className,
      )}
      {...props}
    />
  );
}
