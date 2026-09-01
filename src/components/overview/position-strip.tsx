import type { LucideIcon } from 'lucide-react';
import { Banknote, Boxes, Layers, Ship } from 'lucide-react';
import { Sparkline } from '@/components/charts/sparkline';
import { Money } from '@/components/ui/money';
import { Skeleton, SkeletonNumber } from '@/components/ui/skeleton';
import type { RateMicros } from '@/lib/fx';
import type { Cents } from '@/lib/money';
import { getCashFlow, getCurrentRate, getPosition } from '@/server/queries/overview';

/**
 * Where the business stands, in four numbers.
 *
 * Not the usual four stat cards with invented "+12.5% vs last month" deltas.
 * Each tile carries the real 12-week shape of that figure, and the two that
 * have no meaningful history say so rather than drawing a fake trend.
 */
export async function PositionStrip() {
  const [position, cashFlow, rate] = await Promise.all([
    getPosition(),
    getCashFlow(12),
    getCurrentRate(),
  ]);

  const balances = cashFlow.map((point) => point.balanceCents);
  const srdRate = rate?.rateMicros;

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line-subtle bg-line-subtle sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        Icon={Banknote}
        label="Cash on hand"
        hint="Every entry in the ledger, netted"
        cents={position.cashCents}
        srdRate={srdRate}
        spark={balances}
        tone="accent"
      />
      <Tile
        Icon={Boxes}
        label="Inventory at cost"
        hint="Weighted average, freight included"
        cents={position.inventoryCents}
        srdRate={srdRate}
      />
      <Tile
        Icon={Ship}
        label="Committed on order"
        hint="Bought, not yet received"
        cents={position.committedCents}
        srdRate={srdRate}
      />
      <Tile
        Icon={Layers}
        label="Net position"
        hint="Cash plus stock at cost"
        cents={position.netCents}
        srdRate={srdRate}
        emphasis
      />
    </div>
  );
}

function Tile({
  Icon,
  label,
  hint,
  cents,
  srdRate,
  spark,
  tone = 'muted',
  emphasis,
}: {
  Icon: LucideIcon;
  label: string;
  hint: string;
  cents: Cents;
  srdRate?: RateMicros;
  spark?: number[];
  tone?: 'accent' | 'positive' | 'negative' | 'muted';
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 bg-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">{label}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-4">{hint}</p>
        </div>
        <Icon className="size-4 shrink-0 text-ink-4" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <Money
          cents={cents}
          size={emphasis ? 'xl' : 'lg'}
          srdRate={srdRate}
          className="items-start"
        />
        {spark ? (
          <div className="w-[110px] shrink-0">
            <Sparkline values={spark} tone={tone} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Matches the real tile geometry exactly, so streaming causes no shift. */
export function PositionStripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line-subtle bg-line-subtle sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex flex-col justify-between gap-3 bg-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-[11px] w-24" />
              <Skeleton className="h-[11px] w-32" />
            </div>
            <Skeleton className="size-4 rounded-row" />
          </div>
          <div className="space-y-1">
            <SkeletonNumber chars={9} className="h-[18px]" />
            <SkeletonNumber chars={11} className="h-[11px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
