import { Money } from '@/components/ui/money';
import { formatPercent } from '@/lib/money';
import { getOwnerEquity } from '@/server/queries/overview';

const BARS = ['bg-chart-1', 'bg-chart-3', 'bg-chart-4', 'bg-chart-2', 'bg-chart-5'];

/**
 * Who put in what.
 *
 * Contributions minus draws, straight from the ledger. Nobody types a
 * percentage anywhere: the split is derived, so it cannot disagree with the
 * cash that actually moved.
 */
export async function OwnerEquity() {
  const owners = await getOwnerEquity();

  if (owners.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[13px] text-ink-4">
        No owner contributions recorded yet.
      </p>
    );
  }

  return (
    <div className="p-4">
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-inset">
        {owners.map((owner, index) => (
          <div
            key={owner.memberId}
            className={BARS[index % BARS.length]}
            style={{ width: `${Math.max(owner.share * 100, 0)}%` }}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {owners.map((owner, index) => (
          <li key={owner.memberId} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${BARS[index % BARS.length]}`} />
              <span className="truncate text-[13px] text-ink-2">{owner.fullName}</span>
              <span className="tabular shrink-0 text-[11px] text-ink-4">
                {formatPercent(owner.share)}
              </span>
            </span>
            <Money cents={owner.netCents} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}
