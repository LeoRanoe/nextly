import { ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { listPurchaseOrders } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Purchase orders' };

const STATUS_TONE = {
  draft: 'neutral',
  ordered: 'info',
  shipped: 'accent',
  received: 'positive',
  cancelled: 'negative',
} as const;

export default function PurchaseOrdersPage() {
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Freight, tax and card fees are costs of the goods, not general expenses. On receipt they are allocated across the order's lines pro-rata by value, so every unit carries what it truly cost to land."
        action={
          <Button asChild variant="primary">
            <Link href="/purchase-orders/new">New order</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <OrdersTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function OrdersTable() {
  const rows = await listPurchaseOrders();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={ShoppingCart}
        title="No purchase orders yet"
        description="Raise an order when you buy from Amazon or AliExpress. Enter the goods and the shipping costs, and marking it received will cost the stock correctly."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/purchase-orders/new">New order</Link>
          </Button>
        }
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-[88px]">Number</TH>
            <TH>Supplier</TH>
            <TH>Status</TH>
            <TH className="w-[92px]">Ordered</TH>
            <TH className="w-[92px]">Received</TH>
            <TH numeric>Units</TH>
            <TH numeric>Goods</TH>
            <TH numeric>Freight &amp; fees</TH>
            <TH numeric>Landed total</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-ink">{row.number}</TD>
              <TD className="whitespace-nowrap text-ink-2">{row.supplierName ?? '—'}</TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[row.status]}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </Badge>
                  {row.unallocated ? (
                    <Badge
                      tone="negative"
                      title="Freight and fees were never costed into the goods"
                    >
                      Uncosted
                    </Badge>
                  ) : null}
                </span>
              </TD>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                {formatDate(row.orderedAt)}
              </TD>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                {formatDate(row.receivedAt)}
              </TD>
              <TD numeric className="text-ink-3">
                {row.unitCount}
              </TD>
              <TD numeric className="text-ink-3">
                <Money cents={row.goodsCents} size="sm" tone="muted" />
              </TD>
              <TD numeric>
                <Money cents={row.overheadCents} size="sm" tone="muted" />
              </TD>
              <TD numeric>
                <Money cents={row.totalCents} size="sm" />
              </TD>
            </TR>
          ))}
        </TBody>
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
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
