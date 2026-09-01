import { Truck } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SupplierSheet } from '@/components/forms/reference-sheets';
import { SupplierActions } from '@/components/forms/row-actions';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { humanise } from '@/lib/format';
import { listSuppliers } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Suppliers' };

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Where stock is bought. Spend is the landed total of every received order, so it includes the freight and fees paid to that supplier."
        action={
          <Suspense fallback={null}>
            <SupplierSheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <SuppliersTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function SuppliersTable() {
  const rows = await listSuppliers();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Truck}
        title="No suppliers yet"
        description="Add Amazon, AliExpress or a local supplier before raising a purchase order against them."
        action={
          <Suspense fallback={null}>
            <SupplierSheet />
          </Suspense>
        }
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Supplier</TH>
            <TH>Kind</TH>
            <TH numeric>Products</TH>
            <TH numeric>Orders</TH>
            <TH numeric>Landed spend</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="text-ink">
                <Link
                  href={`/suppliers/${row.id}` as Route}
                  className="hover:text-accent hover:underline"
                >
                  {row.name}
                </Link>
              </TD>
              <TD>
                <Badge>{humanise(row.kind)}</Badge>
              </TD>
              <TD numeric className="text-ink-3">
                {row.productCount}
              </TD>
              <TD numeric className="text-ink-3">
                {row.orderCount}
              </TD>
              <TD numeric>
                <Money cents={row.spendCents} size="sm" />
              </TD>
              <TD className="text-right">
                <SupplierActions
                  id={row.id}
                  name={row.name}
                  kind={row.kind}
                  website={row.website}
                  notes={row.notes}
                  productCount={row.productCount}
                  orderCount={row.orderCount}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
