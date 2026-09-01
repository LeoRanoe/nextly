import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CustomerSheet } from '@/components/forms/reference-sheets';
import { CustomerActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
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
import { formatRelative } from '@/lib/format';
import { listCustomers } from '@/server/queries/lists';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await connection();

  return (
    <>
      <PageHeader
        title="Customers"
        description="Order counts and lifetime spend are derived from confirmed sales, so they cannot drift out of step with the sales themselves."
        action={
          <Suspense fallback={null}>
            <CustomerSheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton rows={3} widths={['w-16', 'w-40', 'w-16']} />}>
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
            <TH />
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
              <TD className="text-right">
                <CustomerActions
                  id={row.id}
                  name={row.name}
                  phone={row.phone ?? ''}
                  email={row.email ?? ''}
                  addressLine={row.addressLine ?? ''}
                  city={row.city ?? ''}
                  notes={row.notes ?? ''}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
