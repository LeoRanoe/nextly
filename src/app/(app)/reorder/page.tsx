import type { Metadata } from 'next';
import Link from 'next/link';
import { ReorderRefreshButton } from '@/components/forms/reorder-refresh-button';
import { ReorderReview } from '@/components/forms/reorder-review';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { listSupplierOptions } from '@/server/queries/pickers';
import {
  getLatestReorderSnapshot,
  getReorderRecommendations,
  listReorderHistory,
} from '@/server/queries/reorder';

export const metadata: Metadata = { title: 'Reorder advice' };

export default async function ReorderPage() {
  const [rows, suppliers, latestSnapshot, history] = await Promise.all([
    getReorderRecommendations(),
    listSupplierOptions(),
    getLatestReorderSnapshot(),
    listReorderHistory(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reorder advice"
        description="Weekly purchasing intelligence for Amazon, AliExpress and other suppliers. Review the recommendation before anything is ordered."
        action={
          <>
            <ExportCsvLink entity="reorder" />
            <ReorderRefreshButton />
            <Button asChild variant="primary">
              <Link href="/purchase-orders/new">Manual PO</Link>
            </Button>
          </>
        }
      />
      <ReorderReview rows={rows} suppliers={suppliers} latestSnapshot={latestSnapshot} />
      <Surface className="overflow-hidden">
        <SurfaceHeader
          title="Snapshot history"
          hint="One local-Monday record per scheduled review"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead className="border-line-subtle border-b text-[11px] text-ink-4 uppercase tracking-[.07em]">
              <tr>
                <th className="px-4 py-3 font-medium">Week</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Lines</th>
                <th className="px-4 py-3 text-right font-medium">Recommended units</th>
                <th className="px-4 py-3 text-right font-medium">Budget-fit cost</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id} className="border-line-subtle border-b last:border-0">
                  <td className="px-4 py-3 tabular text-ink">
                    {new Date(run.runDate).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        run.status === 'completed'
                          ? 'positive'
                          : run.status === 'failed'
                            ? 'negative'
                            : 'warning'
                      }
                    >
                      {run.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-2">{run.lineCount}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-2">
                    {run.recommendedUnits}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money cents={run.budgetCostCents} size="sm" />
                  </td>
                  <td className="max-w-[260px] px-4 py-3 text-[12px] text-ink-3">
                    {run.error ?? 'Stored successfully'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-ink-3">
              No snapshot yet. Refresh recommendations to create the first review record.
            </p>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
