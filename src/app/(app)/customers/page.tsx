import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatRelative } from '@/lib/format';
import { listCustomers } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Order counts and lifetime spend are derived from confirmed sales, so they cannot drift out of step with the sales themselves."
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <CustomersTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function CustomersTable() {
  const rows = await listCustomers();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Users}
        title="No customers yet"
        description="Customers can be created inline while recording a sale, so there is no separate step to remember."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-[70px]">Code</TH>
            <TH>Name</TH>
            <TH>Contact</TH>
            <TH>City</TH>
            <TH numeric>Orders</TH>
            <TH numeric>Spent</TH>
            <TH numeric>Gross earned</TH>
            <TH>Last order</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-ink-3">{row.code}</TD>
              <TD className="text-ink">{row.name}</TD>
              <TD className="whitespace-nowrap text-[12px] text-ink-3">
                {row.phone ?? row.email ?? '—'}
              </TD>
              <TD className="whitespace-nowrap text-ink-3">{row.city ?? '—'}</TD>
              <TD numeric className="text-ink-3">
                {row.orderCount}
              </TD>
              <TD numeric>
                <Money cents={row.spentCents} size="sm" />
              </TD>
              <TD numeric>
                <Money cents={row.grossCents} size="sm" tone="flow" />
              </TD>
              <TD className="whitespace-nowrap text-[12px] text-ink-4">
                {formatRelative(row.lastOrderAt)}
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
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
