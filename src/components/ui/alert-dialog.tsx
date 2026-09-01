'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { SubmitButton } from './submit-button';

/**
 * A centred confirm, for a delete that orphans references but posts nothing.
 *
 * Deliberately not the side `Sheet`: a sheet slides in and reads as "fill in
 * a form", which is the wrong register for "stop and check this". Built on
 * Radix's alert-dialog rather than its plain dialog — `role="alertdialog"`
 * and focus landing on Cancel, not the destructive action, are the entire
 * safety value of this component, and both are easy to get wrong by hand.
 *
 * This is the middle of three tiers of destructive friction (see the doc
 * comment in `forms/row-actions.tsx`): a written reason is for anything that
 * removes a posting, this is for anything else that deletes a record.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <AlertDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2',
            'rounded-card border border-line bg-overlay p-5 shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 duration-150',
          )}
        >
          <AlertDialog.Title className="font-medium text-[15px] text-ink tracking-[-0.01em]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[13px] text-ink-3 leading-relaxed">
            {description}
          </AlertDialog.Description>
          <div className="mt-5 flex items-center justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <SubmitButton
              type="button"
              variant="danger"
              pending={pending}
              onClick={(event) => {
                // AlertDialog.Action closes on click by default; the caller
                // decides when to close (usually onSuccess of the action),
                // so this stays a plain button rather than an Action.
                event.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </SubmitButton>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
