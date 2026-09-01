import { Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money, Percent } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { listSales } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Sales' };

const STATUS_TONE = { draft: 'neutral', confirmed: 'positive', void: 'negative' } as const;

export default function SalesPage() {
  return (
    <>
      <PageHeader
        title="Sales"
        description="Each sale stores the exchange rate in force when it happened and the weighted-average cost it consumed, so neither a rate change nor a later purchase can rewrite a margin recorded months ago."
        action={
          <Button asChild variant="primary">
            <Link href="/sales/new">Record sale</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <SalesTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function SalesTable() {
  const rows = await listSales();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Receipt}
        title="No sales recorded yet"
        description="Recording a sale moves stock, books the cost of goods and posts the receipt to the cash ledger, all in one step."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/sales/new">Record sale</Link>
          </Button>
        }
      />
    );
  }

  const totals = rows
    .filter((row) => row.status === 'confirmed')
    .reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.totalUsdCents,
        cogs: sum.cogs + row.cogsCents,
        gross: sum.gross + row.grossCents,
      }),
      { revenue: 0, cogs: 0, gross: 0 },
    );

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-[70px]">Number</TH>
            <TH className="w-[92px]">Date</TH>
            <TH>Customer</TH>
            <TH>Status</TH>
            <TH numeric>Units</TH>
            <TH numeric>Revenue</TH>
            <TH numeric>Cost</TH>
            <TH numeric>Gross</TH>
            <TH numeric>Margin</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-ink">{row.number}</TD>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                {formatDate(row.soldAt)}
              </TD>
              <TD className="text-ink-2">{row.customerName ?? '—'}</TD>
              <TD>
                <Badge tone={STATUS_TONE[row.status]}>
                  {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                </Badge>
              </TD>
              <TD numeric className="text-ink-3">
                {row.unitCount}
              </TD>
              <TD numeric>
                <Money cents={row.totalUsdCents} size="sm" />
              </TD>
              <TD numeric>
                <Money cents={row.cogsCents} size="sm" tone="muted" />
              </TD>
              <TD numeric>
                <Money cents={row.grossCents} size="sm" tone="flow" />
              </TD>
              <TD numeric>
                <Percent
                  value={row.totalUsdCents === 0 ? 0 : row.grossCents / row.totalUsdCents}
                />
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot className="border-line-subtle border-t bg-inset/60">
          <tr>
            <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={5}>
              Confirmed sales
            </td>
            <td className="h-9 px-3 text-right">
              <Money cents={totals.revenue} size="sm" />
            </td>
            <td className="h-9 px-3 text-right">
              <Money cents={totals.cogs} size="sm" tone="muted" />
            </td>
            <td className="h-9 px-3 text-right">
              <Money cents={totals.gross} size="sm" tone="flow" />
            </td>
            <td className="h-9 px-3 text-right">
              <Percent value={totals.revenue === 0 ? 0 : totals.gross / totals.revenue} />
            </td>
          </tr>
        </tfoot>
      </Table>
    </TableWrap>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-line-subtle">
      <div className="h-8 bg-inset/60" />
      {SKELETON_ROWS.slice(0, 3).map((key) => (
        <div key={key} className="flex h-8 items-center gap-3 px-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
