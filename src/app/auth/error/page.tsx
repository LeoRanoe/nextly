import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Sign-in problem' };

const REASONS: Record<string, string> = {
  'missing-code':
    'That link did not carry a sign-in code. Some email clients rewrite links and break them.',
  'exchange-failed':
    'That link has already been used, or it expired. Sign-in links last one hour.',
};

const FALLBACK =
  'Something went wrong completing sign-in. Requesting a fresh link usually fixes it.';

/**
 * Static shell, streamed message.
 *
 * Reading searchParams makes a component dynamic, so it lives behind its own
 * Suspense boundary. Everything a visitor needs to orient (the mark, the
 * heading, the way out) is prerendered and paints instantly; only the sentence
 * that depends on the query string arrives late.
 */
export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px]">
        <Wordmark />
        <div className="mt-8 flex size-9 items-center justify-center rounded-control bg-negative-muted text-negative">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          Could not sign you in
        </h1>

        <Suspense
          fallback={
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-[13px] w-full" />
              <Skeleton className="h-[13px] w-3/5" />
            </div>
          }
        >
          <Explanation searchParams={searchParams} />
        </Suspense>

        <Button asChild variant="primary" size="lg" className="mt-6 w-full">
          <Link href="/login">Request a new link</Link>
        </Button>
      </div>
    </div>
  );
}

/** The promise is handed down unawaited. Awaiting it here, inside the
 *  boundary, is what keeps the shell above prerenderable. */
async function Explanation({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
      {(reason ? REASONS[reason] : undefined) ?? FALLBACK}
    </p>
  );
}
