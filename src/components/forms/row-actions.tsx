'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  CategorySheet,
  CustomerSheet,
  MemberSheet,
  SupplierSheet,
} from '@/components/forms/reference-sheets';
import { useMember } from '@/components/providers/member-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import { Field, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMoney } from '@/lib/money';
import { deleteExpense, reverseLedgerEntry } from '@/server/actions/finance';
import { deleteProduct, setProductStatus } from '@/server/actions/products';
import { cancelPurchaseOrder, setPurchaseOrderStatus } from '@/server/actions/purchase-orders';
import {
  deleteCategory,
  deleteCustomer,
  deleteSupplier,
  removeMember,
} from '@/server/actions/reference';
import { confirmSale, voidSale } from '@/server/actions/sales';

/**
 * Per-row actions.
 *
 * Three tiers of friction, in increasing order:
 *
 * 1. No prompt — a reversible status flip (mark shipped, archive a product).
 * 2. A confirm dialog (`ConfirmDialog`, `@/components/ui/alert-dialog`) — a
 *    delete that orphans references but posts nothing: category, supplier,
 *    customer, product with no history, expense, member.
 * 3. A written reason (`ReasonSheet`, below) — anything that removes or
 *    reverses a posting: void a sale, cancel an order, reverse a ledger
 *    entry. "Are you sure?" is a speed bump nobody reads; a required
 *    sentence is a speed bump that also leaves a record of why, which is the
 *    part anyone reading the ledger next quarter will actually want.
 */

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
  // Radix only mounts an open Dialog.Content, so a fixed id never collided in
  // practice — but the moment a row's edit sheet and a confirm can coexist,
  // two forms named "reason-form" would fight over which one a detached
  // <button form="..."> submits. useId() makes every instance unique.
  const formId = useId();
  const fieldId = useId();

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
          <SubmitButton form={formId} variant="danger" pending={pending}>
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason);
        }}
      >
        <SheetSection title="Reason">
          <Field label={label} htmlFor={fieldId} required={minimum > 0}>
            <Textarea
              id={fieldId}
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

export function ExpenseActions({
  id,
  description,
  amountUsdCents,
}: {
  id: string;
  description: string;
  amountUsdCents: number;
}) {
  const router = useRouter();
  const { role } = useMember();
  const [confirming, setConfirming] = useState(false);

  const deleteAction = useAction(deleteExpense, {
    onSuccess({ data }) {
      toast.success(`Removed ${data?.description}`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove'),
  });

  // deleteExpense is an ownerAction: staff would only see this refused, so
  // don't offer a menu with nothing they can do.
  if (role !== 'owner') return null;

  return (
    <>
      <Menu>
        <Item danger onSelect={() => setConfirming(true)}>
          Delete {description.length > 18 ? 'expense' : ''}
        </Item>
      </Menu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${description}"?`}
        description={`Its ledger entry goes with it, so cash will go back up by ${formatMoney(amountUsdCents)}. Expenses are the one record that can be plainly deleted: unlike a sale or an order it carries no number and nothing else refers to it.`}
        confirmLabel="Delete expense"
        pending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute({ id })}
      />
    </>
  );
}

/* ── Team ────────────────────────────────────────────────────────────────── */

export function MemberActions({
  id,
  fullName,
  email,
  role: memberRole,
  isPrincipal,
}: {
  id: string;
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
  isPrincipal: boolean;
}) {
  const router = useRouter();
  const { role, email: ownEmail } = useMember();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const removeAction = useAction(removeMember, {
    onSuccess({ data }) {
      toast.success(`${data?.fullName} removed`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove'),
  });

  // updateMember and removeMember are both ownerAction; same reasoning as
  // ExpenseActions above.
  if (role !== 'owner') return null;

  const isSelf = email.toLowerCase() === ownEmail.toLowerCase();

  return (
    <>
      <Menu>
        <Item onSelect={() => setEditing(true)}>Edit</Item>
        {/* removeMember itself refuses a principal or your own row — hiding
         *  the item rather than offering a refusal is just less friction. */}
        {isPrincipal || isSelf ? null : (
          <Item danger onSelect={() => setConfirming(true)}>
            Remove {fullName.split(' ')[0]}
          </Item>
        )}
      </Menu>

      <MemberSheet
        initial={{ id, fullName, email, role: memberRole, isPrincipal }}
        open={editing}
        onOpenChange={setEditing}
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${fullName}?`}
        description="They lose access immediately. Nothing they've recorded — sales, orders, ledger entries — is affected; this only removes their sign-in."
        confirmLabel="Remove"
        pending={removeAction.isPending}
        onConfirm={() => removeAction.execute({ id })}
      />
    </>
  );
}

/* ── Categories ──────────────────────────────────────────────────────────── */

export function CategoryActions({
  id,
  name,
  slug,
  productCount,
}: {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}) {
  const router = useRouter();
  const { role } = useMember();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const deleteAction = useAction(deleteCategory, {
    onSuccess({ data }) {
      toast.success(`${data?.name} deleted`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not delete'),
  });

  return (
    <>
      <Menu>
        <Item onSelect={() => setEditing(true)}>Edit</Item>
        {/* deleteCategory is an ownerAction; staff would only see a refusal. */}
        {role === 'owner' ? (
          <Item danger onSelect={() => setConfirming(true)}>
            Delete
          </Item>
        ) : null}
      </Menu>

      <CategorySheet initial={{ id, name, slug }} open={editing} onOpenChange={setEditing} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${name}"?`}
        description={
          productCount > 0
            ? `${productCount} product${productCount === 1 ? '' : 's'} ${productCount === 1 ? 'is' : 'are'} in this category. Deleting it leaves ${productCount === 1 ? 'that product' : 'them'} uncategorised, not deleted.`
            : 'Nothing is using this category.'
        }
        confirmLabel="Delete category"
        pending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute({ id })}
      />
    </>
  );
}

/* ── Suppliers ───────────────────────────────────────────────────────────── */

export function SupplierActions({
  id,
  name,
  kind,
  website,
  notes,
  productCount,
  orderCount,
}: {
  id: string;
  name: string;
  kind: 'amazon' | 'aliexpress' | 'other';
  website: string;
  notes: string;
  productCount: number;
  orderCount: number;
}) {
  const router = useRouter();
  const { role } = useMember();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const deleteAction = useAction(deleteSupplier, {
    onSuccess({ data }) {
      toast.success(`${data?.name} deleted`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not delete'),
  });

  return (
    <>
      <Menu>
        <Item onSelect={() => setEditing(true)}>Edit</Item>
        {/* orderCount here counts every purchase order regardless of status —
         *  exactly what deleteSupplier itself refuses on, so a visible Delete
         *  item never leads to a refusal it didn't warn about. */}
        {role === 'owner' && orderCount === 0 ? (
          <Item danger onSelect={() => setConfirming(true)}>
            Delete
          </Item>
        ) : null}
      </Menu>

      <SupplierSheet
        initial={{ id, name, kind, website, notes }}
        open={editing}
        onOpenChange={setEditing}
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${name}?`}
        description={
          productCount > 0
            ? `${productCount} product${productCount === 1 ? '' : 's'} ${productCount === 1 ? 'is' : 'are'} sourced from here. Deleting it leaves ${productCount === 1 ? 'that product' : 'them'} without a supplier, not deleted.`
            : 'Nothing is using this supplier.'
        }
        confirmLabel="Delete supplier"
        pending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute({ id })}
      />
    </>
  );
}

/* ── Customers ───────────────────────────────────────────────────────────── */

export function CustomerActions({
  id,
  name,
  phone,
  email,
  addressLine,
  city,
  notes,
}: {
  id: string;
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  notes: string;
}) {
  const router = useRouter();
  const { role } = useMember();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const deleteAction = useAction(deleteCustomer, {
    onSuccess({ data }) {
      toast.success(`${data?.name} deleted`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not delete'),
  });

  return (
    <>
      <Menu>
        <Item onSelect={() => setEditing(true)}>Edit</Item>
        {/* Always offered, not gated on a visible order count: the list's
         *  order count only reflects confirmed sales, but deleteCustomer also
         *  refuses on a draft one, so a client-side gate here could promise
         *  something the server won't do. The refusal, when it happens, says
         *  why. */}
        {role === 'owner' ? (
          <Item danger onSelect={() => setConfirming(true)}>
            Delete
          </Item>
        ) : null}
      </Menu>

      <CustomerSheet
        initial={{ id, name, phone, email, addressLine, city, notes }}
        open={editing}
        onOpenChange={setEditing}
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${name}?`}
        description="Refused if this customer has any sale on the books, confirmed or draft — that history stays. Otherwise this only removes their contact details."
        confirmLabel="Delete customer"
        pending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute({ id })}
      />
    </>
  );
}

/* ── Products ────────────────────────────────────────────────────────────── */

export function ProductActions({
  id,
  name,
  status,
  catalogPublished,
}: {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
}) {
  const router = useRouter();
  const { role } = useMember();
  const [confirming, setConfirming] = useState(false);

  const statusAction = useAction(setProductStatus, {
    onSuccess({ data }) {
      toast.success(`${data?.name} updated`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update'),
  });

  const deleteAction = useAction(deleteProduct, {
    onSuccess({ data }) {
      toast.success(`${data?.name} deleted`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not delete'),
  });

  return (
    <>
      <Menu>
        {status === 'draft' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'active' })}>Activate</Item>
        ) : null}
        {status === 'active' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'archived' })}>Archive</Item>
        ) : null}
        {status === 'archived' ? (
          <Item onSelect={() => statusAction.execute({ id, status: 'active' })}>
            Reactivate
          </Item>
        ) : null}
        <Item
          onSelect={() => statusAction.execute({ id, catalogPublished: !catalogPublished })}
        >
          {catalogPublished ? 'Unpublish from catalog' : 'Publish to catalog'}
        </Item>
        {/* deleteProduct is an ownerAction: staff would only see this refused. */}
        {role === 'owner' ? (
          <Item danger onSelect={() => setConfirming(true)}>
            Delete
          </Item>
        ) : null}
      </Menu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${name}?`}
        description="Refused if this product has stock, sale or purchase-order history — archive it instead, which keeps that history intact. Otherwise this removes the product and its variants completely."
        confirmLabel="Delete product"
        pending={deleteAction.isPending}
        onConfirm={() => deleteAction.execute({ id })}
      />
    </>
  );
}
