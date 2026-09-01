import { Coins } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ExpenseSheet } from '@/components/forms/expense-sheet';
import { ExpenseActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableSkeleton,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  THSort,
  TR,
} from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { expenseQuerySchema, parseListParams, type RawSearchParams } from '@/lib/list-params';
import { listExpenses } from '@/server/queries/lists';
import { listExpenseCategoryOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Expenses' };

export default function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
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
        <ListToolbar>
          <ListSearch placeholder="Search by description or category" />
        </ListToolbar>
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-20', 'w-44', 'w-16']} />}>
          <ExpensesTable searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function ExpensesTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const query = parseListParams(expenseQuerySchema, raw);
  const hasFilters = Boolean(query.q);
  const [result, categories] = await Promise.all([
    listExpenses(query),
    listExpenseCategoryOptions(),
  ]);

  if (result.total === 0 && !hasFilters) {
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

  if (result.rows.length === 0) {
    return (
      <EmptyState
        Icon={Coins}
        title="No expenses match this search"
        description="Try a different description or category."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/expenses">Clear search</Link>
          </Button>
        }
      />
    );
  }

  const pageTotal = result.rows.reduce((sum, row) => sum + row.amountUsdCents, 0);

  const nextDir = (sort: typeof query.sort) =>
    query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc';

  return (
    <>
      <TableWrap>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <THSort
                href={buildHref({ ...query, sort: 'date', dir: nextDir('date'), page: 1 })}
                active={query.sort === 'date'}
                dir={query.dir}
              >
                Date
              </THSort>
              <TH>Description</TH>
              <TH>Category</TH>
              <TH>Method</TH>
              <THSort
                href={buildHref({ ...query, sort: 'amount', dir: nextDir('amount'), page: 1 })}
                active={query.sort === 'amount'}
                dir={query.dir}
                numeric
              >
                Amount
              </THSort>
              <TH />
            </TR>
          </THead>
          <TBody>
            {result.rows.map((row) => (
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
                    categoryId={row.categoryId}
                    occurredDate={row.occurredDate}
                    currency={row.currency as 'USD' | 'SRD'}
                    amountCents={row.amountCents}
                    amountUsdCents={row.amountUsdCents}
                    paymentMethod={row.paymentMethod}
                    notes={row.notes}
                    hasLedgerEntry={row.hasLedgerEntry}
                    categories={categories}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot className="border-line-subtle border-t bg-inset/60">
            <tr>
              <td className="h-9 px-3 text-[12px] text-ink-3" colSpan={4}>
                {result.rows.length} expenses, this page
              </td>
              <td className="h-9 px-3 text-right">
                <Money cents={pageTotal} size="sm" />
              </td>
              <td />
            </tr>
          </tfoot>
        </Table>
      </TableWrap>
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        perPage={result.perPage}
        buildHref={(page) => buildHref({ ...query, page })}
      />
    </>
  );
}

function buildHref(query: { q?: string; sort?: string; dir?: string; page?: number }): Route {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  if (query.dir) params.set('dir', query.dir);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return (search ? `/expenses?${search}` : '/expenses') as Route;
}

/** The sheet reads the URL, so it renders behind its own boundary. */
async function ExpenseTrigger() {
  const categories = await listExpenseCategoryOptions();
  return <ExpenseSheet categories={categories} />;
}
