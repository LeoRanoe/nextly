import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { getAlerts } from '@/server/queries/alerts';

const SEVERITY = {
  critical: { Icon: AlertTriangle, className: 'text-negative' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  info: { Icon: Info, className: 'text-info' },
} as const;

/**
 * The panel that earns the dashboard its keep.
 *
 * Every item is a specific, actionable inconsistency the books can detect on
 * their own. An empty list is a real result and says so, rather than
 * disappearing and leaving the reader unsure whether the check even ran.
 */
export async function AlertsPanel() {
  const alerts = await getAlerts();

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-6">
        <CheckCircle2 className="size-5 shrink-0 text-positive" />
        <div>
          <p className="text-[13px] text-ink">Everything reconciles</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Stock, cash and the documents behind them all agree.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {alerts.map((alert) => {
        const { Icon, className } = SEVERITY[alert.severity];
        return (
          <li key={alert.id}>
            <ConditionalLink href={alert.href}>
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">{alert.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-3 leading-relaxed">{alert.detail}</p>
              </div>
              {alert.href ? (
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
              ) : null}
            </ConditionalLink>
          </li>
        );
      })}
    </ul>
  );
}

function ConditionalLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const className = 'group flex w-full items-start gap-3 px-4 py-3 text-left';
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href as Route} className={cn(className, 'transition-colors hover:bg-hover')}>
      {children}
    </Link>
  );
}
