import { cn } from '@/lib/cn';
import { fromBase, type RateMicros } from '@/lib/fx';
import { type Cents, formatMoney } from '@/lib/money';

/**
 * A storefront price with SRD as the headline figure and USD underneath.
 *
 * The dashboard keeps its books in USD and shows SRD secondarily (see the
 * `Money` component's `srdRate`). A customer thinks the other way round: they
 * walk in paying SRD, so that is the number that should be large. When no rate
 * is configured we fall back to the USD figure alone — better a price than a
 * blank.
 */
const sizes = {
  md: { primary: 'text-[18px]', secondary: 'text-[12px]' },
  lg: { primary: 'text-[24px]', secondary: 'text-[13px]' },
  xl: { primary: 'text-[30px]', secondary: 'text-[14px]' },
} as const;

export function StorePrice({
  usdCents,
  srdRate,
  size = 'lg',
  prefix,
  className,
}: {
  usdCents: Cents;
  srdRate?: RateMicros;
  size?: keyof typeof sizes;
  /** e.g. "from" for a product whose variants span a price range. */
  prefix?: string;
  className?: string;
}) {
  const hasSrd = Boolean(srdRate && srdRate > 0);
  const srnCents = hasSrd ? fromBase(usdCents, srdRate as RateMicros) : 0;

  return (
    <span className={cn('flex flex-col items-start leading-none', className)}>
      <span className="flex items-baseline gap-1.5">
        {prefix ? <span className="text-[12px] text-ink-4">{prefix}</span> : null}
        <span
          className={cn(
            'tabular font-semibold text-ink tracking-[-0.02em]',
            sizes[size].primary,
          )}
        >
          {hasSrd
            ? `${formatMoney(srnCents, 'SRD', { bare: true })} SRD`
            : formatMoney(usdCents, 'USD')}
        </span>
      </span>
      {hasSrd ? (
        <span className={cn('tabular mt-1 text-ink-4', sizes[size].secondary)}>
          {formatMoney(usdCents, 'USD')}
        </span>
      ) : null}
    </span>
  );
}
