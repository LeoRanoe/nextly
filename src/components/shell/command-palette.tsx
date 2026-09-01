'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Command } from 'cmdk';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { ALL_NAV_ITEMS } from '@/lib/navigation';

/**
 * Command palette.
 *
 * Two lists, deliberately in this order: things you can DO, then places you
 * can go. In an operations tool the verb is almost always what someone wants,
 * and a palette that buries "Record a sale" under a list of page names is just
 * a slower sidebar.
 */

const ACTIONS = [
  { href: '/sales/new', label: 'Record a sale', keywords: 'sell order invoice customer' },
  {
    href: '/purchase-orders/new',
    label: 'Raise a purchase order',
    keywords: 'buy po amazon aliexpress restock',
  },
  { href: '/products/new', label: 'Add a product', keywords: 'sku variant catalog item' },
  { href: '/expenses/new', label: 'Log an expense', keywords: 'cost marketing tools spend' },
  {
    href: '/ledger/new',
    label: 'Record a cash movement',
    keywords: 'ledger capital contribution draw balance',
  },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-8 w-full max-w-[280px] items-center gap-2 rounded-control border border-line bg-inset px-2.5',
          'text-[13px] text-ink-4 transition-colors hover:border-line-strong hover:text-ink-3',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        )}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 text-left">Search or jump to</span>
        <kbd className="tabular rounded-[4px] border border-line bg-raised px-1.5 py-0.5 text-[10px] text-ink-4">
          ⌘K
        </kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed top-[18vh] left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2',
              'overflow-hidden rounded-card border border-line bg-overlay shadow-overlay',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98',
              'duration-150',
            )}
          >
            <VisuallyHidden>
              <Dialog.Title>Command palette</Dialog.Title>
              <Dialog.Description>Search actions and pages</Dialog.Description>
            </VisuallyHidden>

            <Command
              loop
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:text-ink-4 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em]"
            >
              <div className="flex items-center gap-2 border-line-subtle border-b px-3">
                <Search className="size-4 shrink-0 text-ink-4" />
                <Command.Input
                  autoFocus
                  placeholder="Search actions and pages"
                  className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
                />
              </div>

              <Command.List className="max-h-[min(52vh,380px)] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-4">
                  Nothing matches that.
                </Command.Empty>

                <Command.Group heading="Actions">
                  {ACTIONS.map((action) => (
                    <Item
                      key={action.href}
                      value={`${action.label} ${action.keywords}`}
                      onSelect={() => go(action.href)}
                    >
                      <Plus className="size-4 shrink-0 text-accent" />
                      {action.label}
                    </Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Go to" className="mt-2">
                  {ALL_NAV_ITEMS.map(({ href, label, Icon, keywords }) => (
                    <Item
                      key={href}
                      value={`${label} ${keywords?.join(' ') ?? ''}`}
                      onSelect={() => go(href)}
                    >
                      <Icon className="size-4 shrink-0 text-ink-4" />
                      {label}
                    </Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer items-center gap-2.5 rounded-control px-3 text-[13px] text-ink-2',
        'data-[selected=true]:bg-hover data-[selected=true]:text-ink',
      )}
    >
      {children}
    </Command.Item>
  );
}
