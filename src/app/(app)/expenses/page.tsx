import { Coins } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExpenseSheet } from '@/components/forms/expense-sheet';
import { ExpenseActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableSkeleton,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { listExpenses } from '@/server/queries/lists';
import { listExpenseCategoryOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Expenses' };

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="Expenses"
        description="Running costs only. Anything paid to get goods into stock belongs on the purchase order instead, where it becomes part of the cost of those goods."
        action={
          <Suspense
            fallback={
              <Button variant="primary" disabled>
                Log expense
              </Button>
            }
          >
            <ExpenseTrigger />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-20', 'w-44', 'w-16']} />}>
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
          <Suspense fallback={null}>
            <ExpenseTrigger />
          </Suspense>
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
            <TH />
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
              <TD className="text-right">
                <ExpenseActions
                  id={row.id}
                  description={row.description}
                  amountUsdCents={row.amountUsdCents}
                />
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
            <td />
          </tr>
        </tfoot>
      </Table>
    </TableWrap>
  );
}

/** The sheet reads the URL, so it renders behind its own boundary. */
async function ExpenseTrigger() {
  const categories = await listExpenseCategoryOptions();
  return <ExpenseSheet categories={categories} />;
}
