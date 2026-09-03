import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { ReorderRefreshButton } from '@/components/forms/reorder-refresh-button';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { getReorderRecommendations } from '@/server/queries/reorder';

export const metadata = { title: 'Reorder advice' };

export default async function ReorderPage() {
  const rows = await getReorderRecommendations();
  const active = rows.filter((row) => row.recommendedQty > 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reorder advice"
        description="Weekly purchasing intelligence for Amazon, AliExpress and other suppliers."
        action={
          <>
            <ReorderRefreshButton />
            <Button asChild variant="primary">
              <Link href="/purchase-orders/new">
                <ShoppingCart className="size-4" /> Manual PO
              </Link>
            </Button>
          </>
        }
      />
      <Surface>
        <SurfaceHeader
          title={`${active.length} recommendations`}
          hint="Advisory only · review before ordering"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-line-subtle border-b text-[11px] uppercase tracking-[.08em] text-ink-4">
              <tr>
                {[
                  'Product',
                  'Score',
                  'On hand',
                  'Inbound',
                  'Days cover',
                  'Qty',
                  'Budget qty',
                  'Cost',
                  'Why',
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr key={row.variantId} className="border-line-subtle border-b last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-ink-2">{row.score.toFixed(0)}</td>
                  <td className="px-4 py-3 text-ink-2">{row.onHand}</td>
                  <td className="px-4 py-3 text-ink-2">{row.inbound}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {row.daysOfCover === null ? '—' : `${row.daysOfCover.toFixed(0)}d`}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{row.recommendedQty}</td>
                  <td className="px-4 py-3 text-ink-2">{row.budgetQty}</td>
                  <td className="px-4 py-3">
                    <Money cents={row.recommendedQty * row.landedUnitCostCents} size="sm" />
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-ink-3">
                    {row.reasons.join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {active.length === 0 ? (
            <p className="p-8 text-center text-ink-3">
              No reorder action is currently required.
            </p>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
