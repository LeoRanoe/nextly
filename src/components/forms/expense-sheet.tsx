'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { useUrlSheet } from '@/lib/use-url-sheet';
import { createExpense, updateExpense } from '@/server/actions/finance';
import type { Option } from '@/server/queries/pickers';

const today = () => new Date().toISOString().slice(0, 10);

export type ExpenseValues = {
  id: string;
  description: string;
  categoryId: string | null;
  occurredAt: string;
  currency: 'USD' | 'SRD';
  amount: string;
  paymentMethod: string;
  postToLedger: boolean;
  notes: string;
};

/**
 * Logging — and correcting — a running cost.
 *
 * `postToLedger` defaults on, because an expense is money leaving the business
 * and the cash balance should reflect it immediately. The escape hatch exists
 * for costs whose payment was already entered by hand, where posting again
 * would double-count.
 *
 * Pass `initial` to edit an existing expense; omit it for a blank form with
 * its own "Log expense" trigger.
 */
export function ExpenseSheet({
  categories,
  initial,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  categories: Option[];
  initial?: ExpenseValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const urlSheet = useUrlSheet('new');
  const open = openProp ?? urlSheet[0];
  const setOpen = onOpenChangeProp ?? urlSheet[1];
  const isEdit = Boolean(initial);
  const formId = useId();

  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt ?? today());
  const [currency, setCurrency] = useState<'USD' | 'SRD'>(initial?.currency ?? 'USD');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? 'cash');
  const [postToLedger, setPostToLedger] = useState(initial?.postToLedger ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Two hook calls, always both — createExpense and updateExpense have
  // different input schemas (update adds `id`), and TypeScript cannot always
  // assign that union to useAction's single expected function type. See the
  // matching comment in forms/reference-sheets.tsx for the full reasoning.
  const createHook = useAction(createExpense, {
    onSuccess({ data }) {
      toast.success(`Logged ${data?.description}`);
      setOpen(false);
      setDescription('');
      setAmount('');
      setNotes('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not log the expense');
    },
  });
  const updateHook = useAction(updateExpense, {
    onSuccess({ data }) {
      toast.success(`${data?.description} updated`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the expense');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  return (
    <>
      {initial === undefined ? (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Log expense
        </Button>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? 'Edit expense' : 'Log an expense'}
        description={
          isEdit
            ? undefined
            : 'Running costs only. Anything paid to get goods into stock belongs on the purchase order, where it becomes part of what those goods cost.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={isPending}>
              {isEdit ? 'Save changes' : 'Log expense'}
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            // `execute` is a union of the create and update action's own
            // function types — the branch above already guarantees the right
            // shape reaches the right action.
            execute({
              ...(isEdit ? { id: initial?.id as string } : {}),
              description,
              categoryId,
              occurredAt,
              currency,
              amountCents: amount,
              paymentMethod: paymentMethod as 'cash',
              notes: notes || undefined,
              postToLedger,
            } as never);
          }}
        >
          <SheetSection title="What">
            <Field label="Description" htmlFor="description" required>
              <Input
                id="description"
                value={description}
                required
                placeholder="Facebook ads, October"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor="category">
              <Combobox
                id="category"
                options={categories.map((c) => ({ value: c.id, label: c.label }))}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Uncategorised"
              />
            </Field>
          </SheetSection>

          <SheetSection title="Amount">
            <FieldRow>
              <Field label="Date" htmlFor="occurredAt" required>
                <Input
                  id="occurredAt"
                  type="date"
                  value={occurredAt}
                  required
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="currency">
                <Select
                  id="currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as 'USD' | 'SRD')}
                >
                  <option value="USD">USD</option>
                  <option value="SRD">SRD</option>
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label={`Amount (${currency})`} htmlFor="amount" required>
                <Input
                  id="amount"
                  numeric
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  required
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Payment" htmlFor="paymentMethod">
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </FieldRow>
          </SheetSection>

          <SheetSection title="Recording">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3">
              <input
                type="checkbox"
                checked={postToLedger}
                onChange={(event) => setPostToLedger(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
              />
              <span>
                <span className="block text-[13px] text-ink">Post to the cash ledger</span>
                <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                  {isEdit
                    ? 'Its existing posting is replaced with one matching these numbers, so cash never reflects both the old and the new amount.'
                    : 'Leave this on unless the payment has already been entered in the ledger by hand, in which case posting again would count it twice.'}
                </span>
              </span>
            </label>
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
