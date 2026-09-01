import { cn } from '@/lib/cn';

/**
 * Type-only lockup, on purpose.
 *
 * Nextly has no identity yet, and a generated logo would be the single fastest
 * way to make the whole product look templated. So the mark is a signal glyph
 * reduced to three arcs and a node: it says "connected device" without
 * pretending to be a finished brand, and it will retire cleanly the day real
 * identity work happens.
 */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'size-5' : 'size-6';
  const type = size === 'sm' ? 'text-[14px]' : 'text-[16px]';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn(box, 'shrink-0')}
        role="img"
        aria-label="Nextly"
      >
        <title>Nextly</title>
        <circle cx="12" cy="12" r="2.25" className="fill-accent" />
        <path
          d="M16.6 7.4a6.5 6.5 0 0 1 0 9.2"
          className="stroke-accent"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M7.4 16.6a6.5 6.5 0 0 1 0-9.2"
          className="stroke-accent"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M20 4a11.3 11.3 0 0 1 0 16"
          className="stroke-accent"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M4 20a11.3 11.3 0 0 1 0-16"
          className="stroke-accent"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity="0.3"
        />
      </svg>
      <span className={cn('font-medium text-ink tracking-[-0.03em]', type)}>Nextly</span>
    </div>
  );
}
