import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * Loading placeholder.
 *
 * Every skeleton must match the geometry of what replaces it. Streaming a
 * widget in behind a skeleton of the wrong height causes the exact layout
 * shift that Suspense was supposed to avoid.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('animate-pulse rounded-control bg-inset', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Placeholder for a monospace figure. Sized in `ch` against the mono stack so
 *  it occupies exactly the width the real number will, rather than guessing in
 *  pixels and shifting the row when the value arrives. */
export function SkeletonNumber({
  chars = 8,
  className,
}: {
  chars?: number;
  className?: string;
}) {
  return (
    <Skeleton
      className={cn('h-[1.1em] rounded-row font-mono', className)}
      style={{ width: `${chars}ch` }}
    />
  );
}
