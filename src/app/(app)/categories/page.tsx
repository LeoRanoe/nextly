import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CategorySheet } from '@/components/forms/reference-sheets';
import { PageHeader } from '@/components/patterns/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { listCategories } from '@/server/queries/reference';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="How products are grouped, in the dashboard today and on the public catalog later."
        action={
          <Suspense fallback={null}>
            <CategorySheet />
          </Suspense>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <CategoriesTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function CategoriesTable() {
  const rows = await listCategories();
  return (
    <TableWrap>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Name</TH>
            <TH>Slug</TH>
            <TH numeric>Products</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="text-ink">{row.name}</TD>
              <TD className="tabular text-[12px] text-ink-3">{row.slug}</TD>
              <TD numeric className="text-ink-2">
                {row.productCount}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
