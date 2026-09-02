import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Not found' };

/**
 * `(store)` segment not-found — the same reasoning as `(app)/not-found.tsx`:
 * a `notFound()` call in here (a stale `/p/[slug]` link, almost always) fell
 * through to the root 404 and stranded the visitor outside the storefront's
 * own header and footer. Kept inside the `(store)` layout, so it doesn't.
 */
export default function StoreNotFound() {
  return (
    <EmptyState
      Icon={PackageSearch}
      title="That product isn't here"
      description="It may have been renamed or taken off the catalog. Browse everything currently available instead."
      action={
        <Button asChild variant="primary" size="sm">
          <Link href="/">Back to the catalog</Link>
        </Button>
      }
    />
  );
}
