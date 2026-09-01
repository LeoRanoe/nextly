'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Side sheet, used for every create and edit form.
 *
 * A sheet rather than a full page because entry almost always happens *while*
 * looking at a list: recording a sale, you want the stock figures still on
 * screen behind it. A route change would take that context away and make
 * cancelling feel like losing your place.
 *
 * Wide enough (`560px`, `720px` for line items) that a table of line items is
 * genuinely usable, which is where most drawer-based forms fall down.
 */

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'md' | 'lg';
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-line-subtle border-l bg-base shadow-overlay',
            size === 'lg' ? 'sm:max-w-[720px]' : 'sm:max-w-[560px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200 ease-out-instrument',
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-line-subtle border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-medium text-[15px] text-ink tracking-[-0.01em]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[12px] text-ink-3 leading-relaxed">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="grid size-7 shrink-0 place-items-center rounded-control text-ink-4 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label="Close"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer ? (
            <footer className="flex shrink-0 items-center justify-end gap-2 border-line-subtle border-t bg-inset px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled block of related fields inside a sheet. */
export function SheetSection({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('mb-6 last:mb-0', className)}>
      <div className="mb-3 border-line-subtle border-b pb-1.5">
        <h3 className="font-medium text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          {title}
        </h3>
        {hint ? <p className="mt-1 text-[11px] text-ink-4">{hint}</p> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
