import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Status pills. Muted fills only. A dashboard full of saturated badges reads
 *  as noise; the eye should land on the one that is actually a problem. */
const badge = cva(
  'inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 font-medium text-[11px] leading-4 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-inset text-ink-2',
        accent: 'border-accent-border bg-accent-muted text-accent',
        positive: 'border-transparent bg-positive-muted text-positive',
        negative: 'border-transparent bg-negative-muted text-negative',
        warning: 'border-transparent bg-warning-muted text-warning',
        info: 'border-transparent bg-info-muted text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** A 6px dot used inside badges and list rows to carry status colour without
 *  a full fill. */
export function Dot({ className }: { className?: string }) {
  return <span className={cn('size-1.5 shrink-0 rounded-full bg-current', className)} />;
}
