import { Download } from 'lucide-react';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import type { RawSearchParams } from '@/lib/list-params';

/**
 * Downloads the same rows the table is showing (F-7).
 *
 * Deliberately a plain anchor to `/api/export` rather than a client button:
 * the browser handles the download natively, and the current filters are
 * already in the page's URL — so passing `searchParams` through is all the
 * wiring an export needs. No JS ships for it.
 */
export async function ExportButton({
  entity,
  searchParams,
}: {
  entity: string;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  params.set('entity', entity);
  for (const [key, value] of Object.entries(raw)) {
    // First value wins on repeated params; none of the list schemas accept
    // arrays anyway, and the parser degrades them identically here.
    if (typeof value === 'string' && key !== 'page') params.set(key, value);
  }
  return (
    <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
      <a href={`/api/export?${params.toString()}` as Route} download>
        <Download className="size-3.5" aria-hidden />
        Export CSV
      </a>
    </Button>
  );
}
