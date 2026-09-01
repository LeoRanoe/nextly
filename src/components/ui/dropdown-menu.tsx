'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Row-action menu and generic dropdown content.
 *
 * Lifted out of `forms/row-actions.tsx`, whose per-row "..." menu was the
 * first caller; `shell/topbar.tsx`'s account menu duplicated the same class
 * strings independently. Both now share this.
 */

export function Menu({
  trigger,
  align = 'end',
  contentClassName,
  children,
}: {
  /** Defaults to the "..." row-action trigger. Pass a custom trigger (e.g.
   *  the account button in Topbar) to reuse the menu content styling only. */
  trigger?: ReactNode;
  align?: 'start' | 'end';
  /** Override the default `min-w-[176px]` — the account menu in Topbar needs
   *  more room for a name and email than a row-action menu does. */
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        asChild={trigger !== undefined}
        aria-label={trigger ? undefined : 'Actions'}
      >
        {trigger ?? (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-control text-ink-4 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[176px] overflow-hidden rounded-card border border-line bg-overlay p-1 shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150',
            contentClassName,
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Item({
  onSelect,
  danger,
  asChild,
  children,
}: {
  onSelect?: () => void;
  danger?: boolean;
  asChild?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      asChild={asChild}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-control px-2.5 text-[13px] outline-none',
        danger
          ? 'text-negative data-[highlighted]:bg-negative-muted'
          : 'text-ink-2 data-[highlighted]:bg-hover data-[highlighted]:text-ink',
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export function Separator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line-subtle" />;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-2">{children}</div>;
}
