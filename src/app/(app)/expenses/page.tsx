import { Coins } from 'lucide-react';
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
import { formatDate, humanise } from '@/lib/format';
import { listExpenses } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Expenses' };

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Running costs only. Anything paid to get goods into stock belongs on the purchase order instead, where it becomes part of the cost of those goods."
        action={
          <Button asChild variant="primary">
            <Link href="/expenses/new">Log expense</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <ExpensesTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function ExpensesTable() {
  const rows = await listExpenses();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Coins}
        title="No expenses logged"
        description="Marketing, software, transport and packaging go here. They reduce the net result on the Overview but never touch the cost of a product."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/expenses/new">Log expense</Link>
          </Button>
        }
      />
    );
  }

  const total = rows.reduce((sum, row) => sum + row.amountUsdCents, 0);

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-[92px]">Date</TH>
            <TH>Description</TH>
            <TH>Category</TH>
            <TH>Method</TH>
            <TH numeric>Amount</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">
                {formatDate(row.occurredAt)}
              </TD>
              <TD className="text-ink">{row.description}</TD>
              <TD>
                <Badge>{row.categoryName ?? 'Uncategorised'}</Badge>
              </TD>
              <TD className="whitespace-nowrap text-[12px] text-ink-4">
                {humanise(row.paymentMethod)}
              </TD>
              <TD numeric>
                <Money cents={row.amountUsdCents} size="sm" />
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot className="border-line-subtle border-t bg-inset/60">
          <tr>
            <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
              {rows.length} expenses
            </td>
            <td className="h-9 px-3 text-right">
              <Money cents={total} size="sm" />
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
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
