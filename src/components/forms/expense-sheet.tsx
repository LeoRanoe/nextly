'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { useUrlSheet } from '@/lib/use-url-sheet';
import { createExpense } from '@/server/actions/finance';
import type { Option } from '@/server/queries/pickers';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Logging a running cost.
 *
 * `postToLedger` defaults on, because an expense is money leaving the business
 * and the cash balance should reflect it immediately. The escape hatch exists
 * for costs whose payment was already entered by hand, where posting again
 * would double-count.
 */
export function ExpenseSheet({ categories }: { categories: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('new');

  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(today());
  const [currency, setCurrency] = useState<'USD' | 'SRD'>('USD');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [postToLedger, setPostToLedger] = useState(true);
  const [notes, setNotes] = useState('');

  const { execute, isPending } = useAction(createExpense, {
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

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Log expense
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Log an expense"
        description="Running costs only. Anything paid to get goods into stock belongs on the purchase order, where it becomes part of what those goods cost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="expense-form" pending={isPending}>
              Log expense
            </SubmitButton>
          </>
        }
      >
        <form
          id="expense-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              description,
              categoryId,
              occurredAt,
              currency,
              amountCents: amount,
              paymentMethod: paymentMethod as 'cash',
              notes: notes || undefined,
              postToLedger,
            });
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
                  Leave this on unless the payment has already been entered in the ledger by
                  hand, in which case posting again would count it twice.
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
