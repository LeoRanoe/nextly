'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';

/**
 * `(app)` segment boundary: catches a throw from any of the 17 routes under
 * the shell (a dropped Postgres connection mid-query, most often — every
 * page here is fully dynamic and hits the database on every request) while
 * keeping the sidebar and topbar on screen, so the way back is never lost.
 *
 * Deliberately reads as an incident, not as the setup banner — this is what
 * a live business's dashboard failing looks like, and it should look
 * different from "nothing configured yet".
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error boundary]', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <Surface className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-10 place-items-center rounded-card border border-negative/30 bg-negative-muted text-negative">
        <AlertTriangle className="size-[18px]" />
      </div>
      <p className="mt-3 font-medium text-[14px] text-ink">Nextly could not load this page</p>
      <p className="mt-1 max-w-[42ch] text-[13px] text-ink-3 leading-relaxed">
        Try again once. If it keeps happening, mention the error code
        {error.digest ? (
          <>
            {' '}
            <span className="tabular text-ink-2">{error.digest}</span>
          </>
        ) : null}{' '}
        to support.
      </p>
      <div className="mt-4">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </Surface>
  );
}
