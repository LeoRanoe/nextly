import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Empty state.
 *
 * Always says what this place is FOR and offers the action that fills it. A
 * shrug and the words "No data" teach nobody anything and make for the laziest
 * screen in most dashboards.
 */
export function EmptyState({
  Icon,
  title,
  description,
  action,
  className,
}: {
  Icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      <div className="grid size-10 place-items-center rounded-card border border-line-subtle bg-inset text-ink-4">
        <Icon className="size-[18px]" />
      </div>
      <p className="mt-3 font-medium text-[14px] text-ink">{title}</p>
      <p className="mt-1 max-w-[42ch] text-[13px] text-ink-3 leading-relaxed">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
