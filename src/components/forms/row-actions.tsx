'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/cn';
import { deleteExpense, reverseLedgerEntry } from '@/server/actions/finance';
import { cancelPurchaseOrder, setPurchaseOrderStatus } from '@/server/actions/purchase-orders';
import { removeMember } from '@/server/actions/reference';
import { confirmSale, voidSale } from '@/server/actions/sales';

/**
 * Per-row actions.
 *
 * Anything destructive that touches the books asks for a reason rather than a
 * yes/no confirmation. "Are you sure?" is a speed bump nobody reads; a required
 * sentence is a speed bump that also leaves a record of why, which is the part
 * anyone reading the ledger next quarter will actually want.
 */

function Menu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Actions"
        className="grid size-7 place-items-center rounded-control text-ink-4 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            'z-50 min-w-[176px] overflow-hidden rounded-card border border-line bg-overlay p-1 shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150',
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  onSelect,
  danger,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
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

/** A destructive action gated behind a written reason. */
function ReasonSheet({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  pending,
  minimum = 0,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  minimum?: number;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton form="reason-form" variant="danger" pending={pending}>
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      <form
        id="reason-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason);
        }}
      >
        <SheetSection title="Reason">
          <Field label={label} htmlFor="reason" required={minimum > 0}>
            <Textarea
              id="reason"
              value={reason}
              required={minimum > 0}
              minLength={minimum}
              placeholder={placeholder}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </SheetSection>
      </form>
    </Sheet>
  );
}

/* ── Sales ───────────────────────────────────────────────────────────────── */

export function SaleActions({
  id,
  number,
  status,
}: {
  id: string;
  number: string;
  status: 'draft' | 'confirmed' | 'void';
}) {
  const router = useRouter();
  const [voiding, setVoiding] = useState(false);

  const confirmAction = useAction(confirmSale, {
    onSuccess({ data }) {
      toast.success(`${data?.number} confirmed`, {
        description: 'Stock moved, cost of goods booked and the receipt posted.',
      });
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not confirm'),
  });

  const voidAction = useAction(voidSale, {
    onSuccess({ data }) {
      toast.success(`${data?.number} voided`, {
        description: 'Its stock and cash postings have been removed.',
      });
      setVoiding(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not void'),
  });

  if (status === 'void') return null;

  return (
    <>
      <Menu>
        {status === 'draft' ? (
          <Item onSelect={() => confirmAction.execute({ id })}>Confirm sale</Item>
        ) : null}
        <Item danger onSelect={() => setVoiding(true)}>
          Void sale
        </Item>
      </Menu>

      <ReasonSheet
        open={voiding}
        onOpenChange={setVoiding}
        title={`Void ${number}`}
        description="The sale is kept and marked void rather than deleted, so the numbered series stays intact. Its stock movement and cash receipt are removed, because those describe things that did not happen."
        label="Why"
        placeholder="Customer returned everything the same day"
        submitLabel="Void sale"
        pending={voidAction.isPending}
        onSubmit={(reason) => voidAction.execute({ id, reason: reason || undefined })}
      />
    </>
  );
}

/* ── Purchase orders ─────────────────────────────────────────────────────── */

export function PurchaseOrderActions({
  id,
  number,
  status,
}: {
  id: string;
  number: string;
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled';
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);

  const statusAction = useAction(setPurchaseOrderStatus, {
    onSuccess({ data }) {
      toast.success(`${data?.number} updated`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update'),
  });

  const cancelAction = useAction(cancelPurchaseOrder, {
    onSuccess({ data }) {
      toast.success(`${data?.number} cancelled`);
      setCancelling(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not cancel'),
  });

  if (status === 'cancelled') return null;

  return (
    <>
      <Menu>
        {status === 'ordered' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'shipped' })}>
            Mark shipped
          </Item>
        ) : null}
        {status === 'shipped' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'ordered' })}>
            Back to ordered
          </Item>
        ) : null}
        <Item danger onSelect={() => setCancelling(true)}>
          Cancel order
        </Item>
      </Menu>

      <ReasonSheet
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Cancel ${number}`}
        description={
          status === 'received'
            ? 'This order has already been received. Cancelling removes the stock it brought in and the payment it posted, which will change what remaining units are worth.'
            : 'The order is kept and marked cancelled so the numbered series stays intact.'
        }
        label="Why"
        placeholder="Supplier cancelled, refunded in full"
        submitLabel="Cancel order"
        pending={cancelAction.isPending}
        onSubmit={(reason) => cancelAction.execute({ id, reason: reason || undefined })}
      />
    </>
  );
}

/* ── Ledger ──────────────────────────────────────────────────────────────── */

export function LedgerActions({ id, description }: { id: string; description: string }) {
  const router = useRouter();
  const [reversing, setReversing] = useState(false);

  const reverseAction = useAction(reverseLedgerEntry, {
    onSuccess() {
      toast.success('Reversing entry recorded');
      setReversing(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not reverse'),
  });

  return (
    <>
      <Menu>
        <Item danger onSelect={() => setReversing(true)}>
          Reverse entry
        </Item>
      </Menu>

      <ReasonSheet
        open={reversing}
        onOpenChange={setReversing}
        title="Reverse this entry"
        description={`The original stays. A new, opposite entry is added for "${description}", because the ledger is append-only and a correction that erased history would be worth less than the mistake.`}
        label="Why"
        placeholder="Entered twice by mistake"
        submitLabel="Record reversal"
        pending={reverseAction.isPending}
        minimum={3}
        onSubmit={(reason) => reverseAction.execute({ id, reason })}
      />
    </>
  );
}

/* ── Expenses ────────────────────────────────────────────────────────────── */

export function ExpenseActions({ id, description }: { id: string; description: string }) {
  const router = useRouter();

  const deleteAction = useAction(deleteExpense, {
    onSuccess({ data }) {
      toast.success(`Removed ${data?.description}`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove'),
  });

  return (
    <Menu>
      <Item
        danger
        onSelect={() => {
          // Expenses are the one record that can be plainly deleted: unlike a
          // sale or an order it carries no number, no stock and no history that
          // anything else refers to.
          deleteAction.execute({ id });
        }}
      >
        Delete {description.length > 18 ? 'expense' : ''}
      </Item>
    </Menu>
  );
}

/* ── Team ────────────────────────────────────────────────────────────────── */

export function MemberActions({ id, fullName }: { id: string; fullName: string }) {
  const router = useRouter();

  const removeAction = useAction(removeMember, {
    onSuccess({ data }) {
      toast.success(`${data?.fullName} removed`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove'),
  });

  return (
    <Menu>
      <Item danger onSelect={() => removeAction.execute({ id })}>
        Remove {fullName.split(' ')[0]}
      </Item>
    </Menu>
  );
}
