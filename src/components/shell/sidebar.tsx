'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { isActivePath, NAVIGATION } from '@/lib/navigation';
import { Wordmark } from './wordmark';

/**
 * Primary navigation.
 *
 * The active item is marked with a 2px accent rule against the sidebar's left
 * edge rather than a filled pill. A filled pill of brand colour on every
 * screen is the single most recognisable tell of a template; a rule reads as
 * an instrument's position indicator and keeps the chrome monochrome.
 */
export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after a link is chosen. The mobile drawer uses it to close
   *  itself, which keeps that behaviour on the interactive element rather
   *  than on a click handler bolted to a wrapping div. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn('flex h-full flex-col gap-6 overflow-y-auto px-3 py-4', className)}
      aria-label="Primary"
    >
      <div className="px-2">
        <Link
          href="/dashboard"
          className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Wordmark />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-5">
        {NAVIGATION.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-[10px] text-ink-4 uppercase tracking-[0.1em]">
              {group.label}
            </p>
            <ul className="flex flex-col gap-px">
              {group.items.map(({ href, label, Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex h-8 items-center gap-2.5 rounded-control pr-2 pl-3 text-[13px]',
                        'transition-colors duration-150 ease-out-instrument',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                        active
                          ? 'bg-hover font-medium text-ink'
                          : 'text-ink-3 hover:bg-hover/60 hover:text-ink-2',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full transition-colors',
                          active ? 'bg-accent' : 'bg-transparent',
                        )}
                      />
                      <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : '')} />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
