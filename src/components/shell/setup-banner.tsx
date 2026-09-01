import { Database } from 'lucide-react';
import { isDatabaseConfigured } from '@/lib/env';

/**
 * Shown until the database connection strings are in place.
 *
 * Without this the dashboard would render perfectly and show zeros everywhere,
 * which is the worst possible failure mode: it looks like a working app
 * reporting that the business has no stock and no money.
 */
export function SetupBanner() {
  if (isDatabaseConfigured()) return null;

  return (
    <div className="border-warning/30 border-b bg-warning-muted px-4 py-2.5 lg:px-6">
      <div className="flex items-start gap-2.5">
        <Database className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 text-[12px] leading-relaxed">
          <p className="font-medium text-ink">Not connected to the database</p>
          <p className="mt-0.5 text-ink-3">
            Every figure below reads zero because there is nothing to read from, not because the
            business has nothing. Add <span className="tabular">DATABASE_URL</span> and{' '}
            <span className="tabular">DIRECT_URL</span> to{' '}
            <span className="tabular">.env.local</span> and restart. See{' '}
            <span className="tabular">docs/05-operations/environments.md</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
