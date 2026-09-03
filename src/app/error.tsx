'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { Button } from '@/components/ui/button';

/**
 * Root segment boundary: covers the public routes (/login, /setup,
 * /no-access, /auth/error, /design-system) — anything that throws inside the
 * `(app)` shell hits `(app)/error.tsx` instead, which keeps the sidebar and
 * topbar on screen. This one matches the full-page style those public routes
 * already use (Wordmark, a toned icon badge, a short explanation).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px]">
        <Wordmark />
        <div className="mt-8 flex size-9 items-center justify-center rounded-control bg-negative-muted text-negative">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          Nextly could not load this page
        </h1>
        <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
          Try again once. If it keeps happening, mention the error code to support
          {error.digest ? (
            <>
              {' '}
              under <span className="tabular text-ink-2">{error.digest}</span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
