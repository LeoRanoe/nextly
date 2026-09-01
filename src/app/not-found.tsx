import { Compass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/shell/wordmark';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Not found' };

/**
 * Root not-found: a mistyped or dead URL outside the `(app)` shell — a
 * `notFound()` call from inside the shell (a deleted product, say) hits
 * `(app)/not-found.tsx` instead, which keeps the sidebar around it.
 */
export default function RootNotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px] text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="mx-auto mt-8 flex size-9 items-center justify-center rounded-control border border-line-subtle bg-inset text-ink-4">
          <Compass className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          Nothing here
        </h1>
        <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
          That page doesn't exist, or the link is out of date.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild variant="primary">
            <Link href="/">Back to Nextly</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
