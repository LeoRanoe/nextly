import { History } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { ActivityEntry } from '@/server/queries/activity';
import { listActivity } from '@/server/queries/activity';

/**
 * The trail the books already keep, read back as a feed.
 *
 * Every Server Action writes an `activity_logs` row; until the Overview
 * surfaced them, only individual document pages ever read them back. Rows
 * link through when the entity has a detail page, and render plain when it
 * does not — a link to nowhere is worse than none.
 */

const ENTITY_ROUTES: Record<string, string> = {
  sale: '/sales',
  purchase_order: '/purchase-orders',
  product: '/products',
  customer: '/customers',
  supplier: '/suppliers',
};

export async function RecentActivity({ limit = 10 }: { limit?: number }) {
  const entries = await listActivity({ limit });

  if (entries.length === 0) {
    return (
      <EmptyState
        Icon={History}
        title="Nothing recorded yet"
        description="Every sale, order, product and cash movement leaves a trail here. It starts with the first one."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/sales/new">Record a sale</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {entries.map((entry) => (
        <li key={entry.id}>
          <ConditionalLink href={entryHref(entry)}>
            <span className="min-w-0 truncate text-[13px] text-ink-2">
              {entry.actorName ?? 'Someone'} {entry.action}
              {entry.entityLabel ? (
                <span className="tabular text-ink-3"> · {entry.entityLabel}</span>
              ) : null}
            </span>
            <span className="whitespace-nowrap text-[12px] text-ink-4">
              {formatRelative(entry.createdAt)}
            </span>
          </ConditionalLink>
        </li>
      ))}
    </ul>
  );
}

function entryHref(entry: ActivityEntry): string | undefined {
  const base = ENTITY_ROUTES[entry.entityType];
  if (!base || !entry.entityId) return undefined;
  return `${base}/${entry.entityId}`;
}

function ConditionalLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const className =
    'group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left';
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href as Route} className={cn(className, 'transition-colors hover:bg-hover')}>
      {children}
    </Link>
  );
}
