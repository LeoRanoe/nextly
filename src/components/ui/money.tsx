import { cn } from '@/lib/cn';
import { fromBase, type RateMicros } from '@/lib/fx';
import {
  type Cents,
  type CurrencyCode,
  type FormatMoneyOptions,
  formatMoney,
  formatPercent,
} from '@/lib/money';

/**
 * The single way money is rendered in Nextly.
 *
 * Always monospaced with tabular figures, so a column of amounts lines up on
 * the decimal. That one detail does more than anything else to make a ledger
 * feel like an instrument rather than a web page.
 *
 * `tone="flow"` colours by sign, for ledger deltas and profit. Everything else
 * stays ink-coloured: a balance sheet where every number is green or red is
 * unreadable, so colour is reserved for the numbers where direction is the
 * point.
 */
type MoneyProps = {
  cents: Cents;
  currency?: CurrencyCode;
  tone?: 'default' | 'flow' | 'muted';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'display';
  /** Second line showing the same amount in SRD at the given rate. */
  srdRate?: RateMicros;
  className?: string;
} & FormatMoneyOptions;

const sizes = {
  sm: 'text-[12px]',
  md: 'text-[13px]',
  lg: 'text-[15px]',
  xl: 'text-[22px] tracking-[-0.02em]',
  display: 'text-[30px] leading-none tracking-[-0.03em]',
} as const;

export function Money({
  cents,
  currency = 'USD',
  tone = 'default',
  size = 'md',
  srdRate,
  className,
  ...format
}: MoneyProps) {
  const toneClass =
    tone === 'flow'
      ? cents > 0
        ? 'text-positive'
        : cents < 0
          ? 'text-negative'
          : 'text-ink-3'
      : tone === 'muted'
        ? 'text-ink-3'
        : 'text-ink';

  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <span className={cn('tabular', sizes[size], toneClass)}>
        {formatMoney(cents, currency, format)}
      </span>
      {srdRate ? (
        <span className="tabular text-[11px] text-ink-4">
          {formatMoney(fromBase(cents, srdRate), 'SRD', { bare: true })} SRD
        </span>
      ) : null}
    </span>
  );
}

/** A margin or share, rendered in the same tabular voice as money. */
export function Percent({
  value,
  digits = 1,
  tone = 'default',
  className,
}: {
  value: number;
  digits?: number;
  tone?: 'default' | 'flow' | 'muted';
  className?: string;
}) {
  const toneClass =
    tone === 'flow'
      ? value > 0
        ? 'text-positive'
        : value < 0
          ? 'text-negative'
          : 'text-ink-3'
      : tone === 'muted'
        ? 'text-ink-3'
        : 'text-ink-2';
  return (
    <span className={cn('tabular text-[12px]', toneClass, className)}>
      {formatPercent(value, digits)}
    </span>
  );
}

/** Counts, quantities, SKUs, document numbers. Same tabular treatment. */
export function Numeric({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('tabular text-[13px]', className)}>{children}</span>;
}
