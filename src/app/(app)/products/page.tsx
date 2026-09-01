import { ImageOff, Package } from 'lucide-react';
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
import { listProducts } from '@/server/queries/lists';

/** Stable keys for placeholder rows. Skeletons never reorder, but an
 *  index key still teaches the wrong habit to whoever copies this next. */
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const metadata: Metadata = { title: 'Products' };

const STATUS_TONE = { draft: 'neutral', active: 'positive', archived: 'neutral' } as const;

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        description="A product is what a customer recognises; a variant is what is actually stocked and sold. Publishing a product is what will put it on the public catalog, from these same rows."
        action={
          <Button asChild variant="primary">
            <Link href="/products/new">Add product</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          <ProductsTable />
        </Suspense>
      </Surface>
    </>
  );
}

async function ProductsTable() {
  const rows = await listProducts();

  if (rows.length === 0) {
    return (
      <EmptyState
        Icon={Package}
        title="No products yet"
        description="Add a product, give it a variant for each colour or size, and it becomes available to buy on a purchase order and to sell."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/products/new">Add product</Link>
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
            <TH>Product</TH>
            <TH>Code</TH>
            <TH>Category</TH>
            <TH>Supplier</TH>
            <TH>Status</TH>
            <TH numeric>Variants</TH>
            <TH numeric>On hand</TH>
            <TH numeric>From</TH>
            <TH numeric>Stock value</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="text-ink">
                <span className="inline-flex items-center gap-2">
                  {row.imageCount === 0 ? (
                    <ImageOff className="size-3.5 shrink-0 text-ink-4" aria-label="No image" />
                  ) : null}
                  {row.name}
                </span>
              </TD>
              <TD className="tabular whitespace-nowrap text-[12px] text-ink-3">{row.code}</TD>
              <TD className="whitespace-nowrap text-ink-3">{row.categoryName ?? '—'}</TD>
              <TD className="whitespace-nowrap text-ink-3">{row.supplierName ?? '—'}</TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[row.status]}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </Badge>
                  {row.catalogPublished ? <Badge tone="accent">Published</Badge> : null}
                </span>
              </TD>
              <TD numeric className="text-ink-3">
                {row.variantCount}
              </TD>
              <TD numeric>{row.onHand}</TD>
              <TD numeric>
                <Money cents={row.listPriceCents} size="sm" tone="muted" />
              </TD>
              <TD numeric>
                <Money cents={row.stockValueCents} size="sm" />
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
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
