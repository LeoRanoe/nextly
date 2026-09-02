import { Compass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';

export const metadata: Metadata = { title: 'Not found' };

/**
 * `(app)` segment not-found: every `notFound()` call inside the shell lands
 * here — a deleted product (`products/[id]:42`), and the same for sales,
 * purchase orders, customers and suppliers once their detail pages exist.
 * Before this file existed, that fell through to the root 404, stranding the
 * visitor outside the shell with no sidebar and no way back. Kept inside the
 * `(app)` layout, so it doesn't.
 */
export default function AppNotFound() {
  return (
    <Surface className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-10 place-items-center rounded-card border border-line-subtle bg-inset text-ink-4">
        <Compass className="size-[18px]" />
      </div>
      <p className="mt-3 font-medium text-[14px] text-ink">Not found</p>
      <p className="mt-1 max-w-[42ch] text-[13px] text-ink-3 leading-relaxed">
        Whatever this pointed to isn't there anymore — deleted, or the link is out of date.
      </p>
      <div className="mt-4">
        <Button asChild variant="primary" size="sm">
          <Link href="/dashboard">Back to Overview</Link>
        </Button>
      </div>
    </Surface>
  );
}
