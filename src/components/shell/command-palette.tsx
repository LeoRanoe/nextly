'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Command } from 'cmdk';
import { Fingerprint, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { searchSerialsAction } from '@/server/actions/search';
import type { SerialHit } from '@/server/queries/warranty';

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
  { href: '/expenses?new=1', label: 'Log an expense', keywords: 'cost marketing tools spend' },
  {
    href: '/ledger?new=1',
    label: 'Record a cash movement',
    keywords: 'ledger capital contribution draw balance',
  },
  {
    href: '/customers?new-customer=1',
    label: 'Add a customer',
    keywords: 'client buyer contact',
  },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // F-6: serial lookup. The input is controlled so a ≥3-character prefix can
  // be debounced into `searchSerialsAction`; results render as their own group
  // and are exempt from cmdk's built-in filtering via `keywords` (see Item).
  const [term, setTerm] = useState('');
  const [serialHits, setSerialHits] = useState<SerialHit[]>([]);
  const requestSeq = useRef(0);

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

  useEffect(() => {
    if (!open) {
      setTerm('');
      setSerialHits([]);
      return;
    }
    const prefix = term.trim();
    if (prefix.length < 3) {
      setSerialHits([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      searchSerialsAction(prefix)
        .then((hits) => {
          // A stale response must not overwrite a newer one — keystrokes can
          // resolve out of order.
          if (requestSeq.current === seq) setSerialHits(hits);
        })
        .catch(() => {
          if (requestSeq.current === seq) setSerialHits([]);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [term, open]);

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
          'flex h-8 w-full max-w-[280px] min-w-0 items-center justify-center gap-2 rounded-control border border-line bg-inset px-2.5 sm:justify-start',
          'text-[13px] text-ink-4 transition-colors hover:border-line-strong hover:text-ink-3',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        )}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">
          Search or jump to
        </span>
        <kbd className="tabular hidden rounded-[4px] border border-line bg-raised px-1.5 py-0.5 text-[10px] text-ink-4 sm:inline">
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
                  value={term}
                  onValueChange={setTerm}
                  placeholder="Search actions, pages or serials"
                  className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
                />
              </div>

              <Command.List className="max-h-[min(52vh,380px)] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-4">
                  Nothing matches that.
                </Command.Empty>

                {serialHits.length > 0 ? (
                  <Command.Group heading="Serial numbers">
                    {serialHits.map((hit) => (
                      <Item
                        key={`${hit.saleId}-${hit.serial}`}
                        value={`serial ${hit.serial}`}
                        // cmdk filters locally and never saw the server's
                        // answer — without keywords the hits would vanish from
                        // the list as soon as the prefix narrows.
                        keywords={[hit.serial, hit.productName, hit.customerName ?? '']}
                        onSelect={() => go(`/sales/${hit.saleId}`)}
                      >
                        <Fingerprint className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 truncate">
                          <span className="tabular">{hit.serial}</span>
                          {' · '}
                          {hit.productName}
                          {hit.customerName ? ` · ${hit.customerName}` : ''}
                        </span>
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

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
  keywords,
  onSelect,
  children,
}: {
  value: string;
  /** Extra words cmdk matches against, in place of the rendered label. */
  keywords?: string[];
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
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
