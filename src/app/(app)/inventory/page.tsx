import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatRelative } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { listStock } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Inventory' };

const LOW_STOCK_AT = 5;

export default async function InventoryPage() {
  await connection();

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand is the sum of the movement ledger, never a number anyone edits. Value is weighted-average landed cost, so it includes the freight and fees paid to get each unit here."
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <StockTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function StockTable() {
  const rows = await listStock();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Boxes}
        title="Nothing in stock yet"
        description="Stock appears here as soon as a purchase order is marked received. Nothing is entered by hand."
      />
    );
  }

  const totalValue = rows.reduce((sum, row) => sum + row.valueCents, 0);
  const totalUnits = rows.reduce((sum, row) => sum + Math.max(row.onHand, 0), 0);

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH>Category</TH>
            <TH numeric>Received</TH>
            <TH numeric>Sold</TH>
            <TH numeric>Inbound</TH>
            <TH numeric>On hand</TH>
            <TH numeric>Unit cost</TH>
            <TH numeric>Value</TH>
            <TH>Last movement</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const low = row.onHand > 0 && row.onHand <= LOW_STOCK_AT;
            const negative = row.onHand < 0;
            return (
              <TR key={row.variantId}>
                <TD className="whitespace-nowrap text-ink">
                  {row.productName}
                  <span className="text-ink-4"> · {row.variantName}</span>
                </TD>
                <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">{row.sku}</TD>
                <TD className="whitespace-nowrap text-ink-3">{row.categoryName ?? '—'}</TD>
                <TD numeric className="text-ink-3">
                  {row.received}
                </TD>
                <TD numeric className="text-ink-3">
                  {row.sold}
                </TD>
                <TD numeric className={row.inbound > 0 ? 'text-accent' : 'text-ink-4'}>
                  {row.inbound || '—'}
                </TD>
                <TD numeric>
                  <span className="inline-flex items-center gap-1.5">
                    {negative ? (
                      <Badge tone="negative">Below zero</Badge>
                    ) : low ? (
                      <Badge tone="warning">Low</Badge>
                    ) : null}
                    {row.onHand}
                  </span>
                </TD>
                <TD numeric className="text-ink-3">
                  {row.unitCostCents === null
                    ? '—'
                    : `$${(row.unitCostCents / 100).toFixed(4)}`}
                </TD>
                <TD numeric>{formatMoney(row.valueCents)}</TD>
                <TD className="whitespace-nowrap text-[12px] text-ink-4">
                  {formatRelative(row.lastMovementAt)}
                </TD>
              </TR>
            );
          })}
        </TBody>
        <tfoot className="border-line-subtle border-t bg-inset/60">
          <tr>
            <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={6}>
              {rows.length} variants
            </td>
            <td className="tabular h-9 px-3 text-right text-ink">{totalUnits}</td>
            <td />
            <td className="h-9 px-3 text-right">
              <Money cents={totalValue} size="sm" />
            </td>
            <td />
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
      {SKELETON_ROWS.slice(0, 4).map((key) => (
        <div key={key} className="flex h-8 items-center gap-3 px-3">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
