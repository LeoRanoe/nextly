'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ExpenseSheet } from '@/components/forms/expense-sheet';
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
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import type { PaymentBadgeCode } from '@/lib/payment-status';
import { balanceCentsOf, PAYMENT_LABELS, paymentStatusOf } from '@/lib/payment-status';
import { deleteExpense, reverseLedgerEntry } from '@/server/actions/finance';
import { deleteProduct, setProductStatus } from '@/server/actions/products';
import {
  cancelPurchaseOrder,
  recordPurchaseOrderPayment,
  setPurchaseOrderStatus,
} from '@/server/actions/purchase-orders';
import {
  deleteCategory,
  deleteCustomer,
  deleteSupplier,
  removeMember,
} from '@/server/actions/reference';
import { confirmSale, recordSalePayment, voidSale } from '@/server/actions/sales';
import type { Option } from '@/server/queries/pickers';

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
  totalCents = 0,
  paidCents = 0,
  currency = 'USD',
  paymentStatus,
}: {
  id: string;
  number: string;
  status: 'draft' | 'confirmed' | 'void';
  /** Only needed for a confirmed sale — the balance decides whether offering a
   *  payment makes sense. A draft being confirmed goes through `ConfirmSheet`
   *  instead, which asks about the money itself (F-4). */
  totalCents?: Cents;
  paidCents?: Cents;
  currency?: CurrencyCode;
  /** Pass it in when the caller already displays the badge, so the menu does
   *  not offer something the screen has just said is settled. */
  paymentStatus?: PaymentBadgeCode | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [paying, setPaying] = useState(false);

  const confirmAction = useAction(confirmSale, {
    onSuccess({ data }) {
      toast.success(`${data?.number} confirmed`, {
        description: 'Stock moved and cost of goods booked.',
      });
      setConfirming(false);
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

  const balance = balanceCentsOf(totalCents, paidCents);
  const unpaid =
    status === 'confirmed' &&
    (paymentStatus ? paymentStatus !== 'paid' : balance > 0) &&
    balance > 0;

  return (
    <>
      <Menu>
        {unpaid ? <Item onSelect={() => setPaying(true)}>Record payment</Item> : null}
        {status === 'draft' ? (
          <Item onSelect={() => setConfirming(true)}>Confirm sale</Item>
        ) : null}
        <Item danger onSelect={() => setVoiding(true)}>
          Void sale
        </Item>
      </Menu>

      {status === 'draft' ? (
        <ConfirmSheet
          open={confirming}
          onOpenChange={setConfirming}
          number={number}
          pending={confirmAction.isPending}
          onSubmit={(paidInFull, paidNowCents) =>
            confirmAction.execute({ id, paidInFull, paidNowCents: String(paidNowCents) })
          }
        />
      ) : null}

      {unpaid ? (
        <RecordPaymentSheet
          open={paying}
          onOpenChange={setPaying}
          saleId={id}
          number={number}
          currency={currency}
          balanceCents={balance}
        />
      ) : null}

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

/**
 * Confirming a draft, and deciding what happened to the money (F-4).
 *
 * The old behaviour was implicit: confirming always posted the whole receipt.
 * That was right when every sale was cash and wrong the moment credit sales
 * existed, because a receipt for money that never arrived inflates cash and
 * hides a receivable. So the sheet asks the question outright, with "paid in
 * full" as the default to keep the common path one click.
 */
function ConfirmSheet({
  open,
  onOpenChange,
  number,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  number: string;
  pending: boolean;
  onSubmit: (paidInFull: boolean, paidNowCents: Cents) => void;
}) {
  const [paidInFull, setPaidInFull] = useState(true);
  const [deposit, setDeposit] = useState('');
  const formId = useId();

  let depositCents: Cents = 0;
  try {
    depositCents = parseMoney(deposit || '0');
  } catch {
    depositCents = 0;
  }
  if (!Number.isFinite(depositCents) || depositCents < 0) depositCents = 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Confirm ${number}`}
      description="Confirming moves stock and books the cost of goods. What it does with the cash depends on the answer below."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton
            form={formId}
            variant="primary"
            pending={pending}
            disabled={!paidInFull && depositCents <= 0}
          >
            {paidInFull ? 'Confirm sale' : 'Confirm on credit'}
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(paidInFull, paidInFull ? 0 : depositCents);
        }}
      >
        <SheetSection title="Payment">
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3 transition-colors hover:border-line-strong has-[:checked]:border-accent-border has-[:checked]:bg-accent-muted/40">
              <input
                type="radio"
                name="paid-in-full"
                checked={paidInFull}
                onChange={() => setPaidInFull(true)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-[13px] text-ink">Paid in full now</span>
                <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                  Posts one receipt for the whole amount to the cash ledger.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3 transition-colors hover:border-line-strong has-[:checked]:border-accent-border has-[:checked]:bg-accent-muted/40">
              <input
                type="radio"
                name="paid-in-full"
                checked={!paidInFull}
                onChange={() => setPaidInFull(false)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-[13px] text-ink">Money comes later</span>
                <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                  Nothing posts until each payment arrives. The balance then reads as owed — and
                  overdue after 30 days.
                </span>
              </span>
            </label>
          </div>
          {!paidInFull ? (
            <Field
              label="Deposit taken now"
              htmlFor={`${formId}-deposit`}
              hint="Optional — leave empty if nothing arrived yet"
            >
              <Input
                id={`${formId}-deposit`}
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
              />
            </Field>
          ) : null}
        </SheetSection>
      </form>
    </Sheet>
  );
}

/**
 * Money arriving against a sale that is already confirmed (F-4).
 *
 * The balance is prefilled because the overwhelmingly common case is settling
 * it in one go; partial payments mean clearing the field and typing what was
 * actually handed over. Overpaying is refused server-side, so this only needs
 * to show the number plainly.
 */
export function RecordPaymentSheet({
  open,
  onOpenChange,
  saleId,
  number,
  currency,
  balanceCents,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  saleId: string;
  number: string;
  currency: CurrencyCode;
  balanceCents: Cents;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(toDecimalString(balanceCents, currency));
  const [method, setMethod] = useState('cash');
  const [receivedAt, setReceivedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();

  let parsed: Cents = 0;
  try {
    parsed = parseMoney(amount || '0');
  } catch {
    parsed = 0;
  }
  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;

  const payAction = useAction(recordSalePayment, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(
        `${formatMoney(data.amountCents, data.currency)} recorded on ${data.number}`,
        {
          description:
            data.paymentStatus === 'paid'
              ? 'That settles the sale. Its receipt is in the cash ledger.'
              : `${PAYMENT_LABELS[data.paymentStatus]} — ${formatMoney(data.balanceCents, data.currency)} still owed.`,
        },
      );
      onOpenChange(false);
      setIdempotencyKey(undefined);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the payment');
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Payment on ${number}`}
      description={`Outstanding balance ${formatMoney(balanceCents, currency)}. Each payment posts its own receipt to the cash ledger, dated the day the money arrived.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton
            form={formId}
            variant="primary"
            pending={payAction.isPending}
            disabled={parsed <= 0}
          >
            Record payment
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const key = idempotencyKey ?? crypto.randomUUID();
          setIdempotencyKey(key);
          payAction.execute({
            saleId,
            amountCents: String(parsed),
            idempotencyKey: key,
            paymentMethod: method as 'cash',
            receivedAt: receivedAt || undefined,
            notes: notes || undefined,
          });
        }}
      >
        <SheetSection title="Payment">
          <Field label={`Amount (${currency})`} htmlFor={`${formId}-amount`} required>
            <Input
              id={`${formId}-amount`}
              numeric
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method" htmlFor={`${formId}-method`}>
              <Select
                id={`${formId}-method`}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date received" htmlFor={`${formId}-date`} hint="Empty means today">
              <Input
                id={`${formId}-date`}
                type="date"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Note" htmlFor={`${formId}-notes`} hint="Optional">
            <Input
              id={`${formId}-notes`}
              placeholder="Reference, who brought it…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </SheetSection>
      </form>
    </Sheet>
  );
}

/* ── Purchase orders ─────────────────────────────────────────────────────── */

export function PurchaseOrderActions({
  id,
  number,
  status,
  currency = 'USD',
  balanceCents = 0,
}: {
  id: string;
  number: string;
  status: 'draft' | 'ordered' | 'shipped' | 'received' | 'cancelled';
  /** Orders are always USD today; the prop keeps the sheet honest if that changes. */
  currency?: CurrencyCode;
  /** Outstanding amount (landed − paid). Only meaningful once received. */
  balanceCents?: Cents;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);

  const unpaid = status === 'received' && balanceCents > 0;

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
        {unpaid ? <Item onSelect={() => setPaying(true)}>Record payment</Item> : null}
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

      {unpaid ? (
        <SupplierPaymentSheet
          open={paying}
          onOpenChange={setPaying}
          orderId={id}
          number={number}
          currency={currency}
          balanceCents={balanceCents}
        />
      ) : null}

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

/** Pays part or all of what a purchase order still owes the supplier (F-9).
 *  Prefilled with the full balance, because that is the common case. Each
 *  payment posts its own expense to the cash ledger under its own identity —
 *  cancelling the order later must not erase money that actually left. */
function SupplierPaymentSheet({
  open,
  onOpenChange,
  orderId,
  number,
  currency,
  balanceCents,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  orderId: string;
  number: string;
  currency: CurrencyCode;
  balanceCents: Cents;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(toDecimalString(balanceCents, currency));
  const [method, setMethod] = useState('card');
  const [paidAt, setPaidAt] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();

  let parsed: Cents = 0;
  try {
    parsed = parseMoney(amount || '0');
  } catch {
    parsed = 0;
  }
  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;

  const payAction = useAction(recordPurchaseOrderPayment, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(`${formatMoney(data.amountCents, currency)} recorded on ${data.number}`, {
        description:
          data.balanceCents > 0
            ? `${PAYMENT_LABELS[paymentStatusOf(data.landedCents, data.paidCents)]} — ${formatMoney(data.balanceCents, currency)} still owed.`
            : 'That settles the order. Its payments are in the cash ledger.',
      });
      onOpenChange(false);
      setIdempotencyKey(undefined);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the payment');
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Payment on ${number}`}
      description={`Outstanding balance ${formatMoney(balanceCents, currency)}. Each payment posts its own expense to the cash ledger, dated the day the money left — cancelling the order cannot erase them.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton
            form={formId}
            variant="primary"
            pending={payAction.isPending}
            disabled={parsed <= 0}
          >
            Record payment
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const key = idempotencyKey ?? crypto.randomUUID();
          setIdempotencyKey(key);
          payAction.execute({
            orderId,
            amountCents: String(parsed),
            idempotencyKey: key,
            paymentMethod: method as 'cash',
            paidAt: paidAt || undefined,
            notes: notes || undefined,
          });
        }}
      >
        <SheetSection title="Payment">
          <Field label={`Amount (${currency})`} htmlFor={`${formId}-amount`} required>
            <Input
              id={`${formId}-amount`}
              numeric
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method" htmlFor={`${formId}-method`}>
              <Select
                id={`${formId}-method`}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date paid" htmlFor={`${formId}-date`} hint="Empty means today">
              <Input
                id={`${formId}-date`}
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Note" htmlFor={`${formId}-notes`} hint="Optional">
            <Input
              id={`${formId}-notes`}
              placeholder="TT reference, invoice number…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </SheetSection>
      </form>
    </Sheet>
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
  categoryId,
  occurredDate,
  currency,
  amountCents,
  amountUsdCents,
  paymentMethod,
  notes,
  hasLedgerEntry,
  categories,
}: {
  id: string;
  description: string;
  categoryId: string | null;
  occurredDate: string;
  currency: 'USD' | 'SRD';
  amountCents: number;
  amountUsdCents: number;
  paymentMethod: string;
  notes: string | null;
  hasLedgerEntry: boolean;
  categories: Option[];
}) {
  const router = useRouter();
  const { role } = useMember();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const deleteAction = useAction(deleteExpense, {
    onSuccess({ data }) {
      toast.success(`Removed ${data?.description}`);
      setConfirming(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove'),
  });

  // updateExpense is writeAction, deleteExpense is ownerAction: a viewer gets
  // no menu at all, staff gets Edit only.
  if (role === 'viewer') return null;

  return (
    <>
      <Menu>
        <Item onSelect={() => setEditing(true)}>Edit</Item>
        {role === 'owner' ? (
          <Item danger onSelect={() => setConfirming(true)}>
            Delete {description.length > 18 ? 'expense' : ''}
          </Item>
        ) : null}
      </Menu>

      <ExpenseSheet
        categories={categories}
        initial={{
          id,
          description,
          categoryId,
          occurredAt: occurredDate,
          currency,
          amount: toDecimalString(amountCents, currency),
          paymentMethod,
          postToLedger: hasLedgerEntry,
          notes: notes ?? '',
        }}
        open={editing}
        onOpenChange={setEditing}
      />

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
