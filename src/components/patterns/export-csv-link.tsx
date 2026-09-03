import { Download } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { RawSearchParams } from '@/lib/list-params';

export type CsvExportEntity =
  | 'products'
  | 'inventory'
  | 'sales'
  | 'purchase-orders'
  | 'customers'
  | 'expenses'
  | 'ledger'
  | 'quotes'
  | 'quote-requests'
  | 'reorder'
  | 'bundles'
  | 'suppliers'
  | 'categories';

export async function ExportCsvLink({
  entity,
  searchParams,
}: {
  entity: CsvExportEntity;
  searchParams?: Promise<RawSearchParams>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = new URLSearchParams({ entity });
  const value = raw.q;
  const first = Array.isArray(value) ? value[0] : value;
  if (first) query.set('q', first);

  return (
    <Button asChild variant="outline" size="md">
      <Link href={`/api/export?${query.toString()}` as Route}>
        <Download aria-hidden="true" />
        Export CSV
      </Link>
    </Button>
  );
}
