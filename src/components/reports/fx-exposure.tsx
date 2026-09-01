import { Sparkline } from '@/components/charts/sparkline';
import { Money, Percent } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatRate } from '@/lib/fx';
import { getFxExposure } from '@/server/queries/reports';

/**
 * What actually moves when the SRD rate moves: every SRD-denominated
 * ledger entry, booked at the rate in force when it happened, revalued at
 * today's rate. The difference is an unrealised gain or loss purely from
 * the rate — not from anything the business did.
 */
export async function FxExposureReport() {
  const exposure = await getFxExposure();

  if (exposure.currentRateMicros === null) {
    return (
      <Surface>
        <SurfaceHeader title="FX exposure" hint="What moves when the SRD rate moves" />
        <p className="px-4 py-10 text-center text-[13px] text-ink-4">
          No exchange rate has been set yet — add one in Settings.
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="FX exposure"
        hint={`1 USD = ${formatRate(exposure.currentRateMicros, 2)} SRD today`}
      />
      <div className="grid grid-cols-2 gap-4 p-4">
        <Stat
          label="SRD booked at"
          money={exposure.srdBookedUsdCents}
          hint="Value when each entry happened"
        />
        <Stat
          label="Revalued today"
          money={exposure.srdRevaluedUsdCents}
          hint="Same SRD total, today's rate"
        />
        <Stat
          label="Unrealised"
          money={exposure.unrealizedCents}
          tone="flow"
          hint="Revalued minus booked"
        />
        <div>
          <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Rate, last year</p>
          <div className="mt-1.5">
            <Sparkline
              values={exposure.rateSeries.map((r) => r.rateMicros).reverse()}
              tone="accent"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-line-subtle border-t px-4 py-3">
        <div>
          <p className="text-[11px] text-ink-4">Revenue charged in SRD</p>
          <Percent value={exposure.srdRevenueShare} digits={0} className="mt-0.5 text-[13px]" />
        </div>
        <div>
          <p className="text-[11px] text-ink-4">Cash movement in SRD</p>
          <Percent value={exposure.srdCashShare} digits={0} className="mt-0.5 text-[13px]" />
        </div>
      </div>
    </Surface>
  );
}

function Stat({
  label,
  money,
  hint,
  tone,
}: {
  label: string;
  money: number;
  hint: string;
  tone?: 'default' | 'flow' | 'muted';
}) {
  return (
    <div>
      <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <div className="mt-1">
        <Money cents={money} size="lg" tone={tone} />
      </div>
      <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>
    </div>
  );
}
