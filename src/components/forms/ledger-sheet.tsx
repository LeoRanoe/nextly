'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { useUrlSheet } from '@/lib/use-url-sheet';
import { createLedgerEntry } from '@/server/actions/finance';
import type { Option } from '@/server/queries/pickers';

const today = () => new Date().toISOString().slice(0, 10);

const CATEGORIES = [
  { value: 'owner_contribution', label: 'Owner contribution', direction: 'in' },
  { value: 'owner_draw', label: 'Owner draw', direction: 'out' },
  { value: 'sales_receipt', label: 'Sales receipt', direction: 'in' },
  { value: 'purchase', label: 'Stock purchase', direction: 'out' },
  { value: 'shipping', label: 'Shipping', direction: 'out' },
  { value: 'operating', label: 'Operating cost', direction: 'out' },
  { value: 'refund', label: 'Refund', direction: 'out' },
  { value: 'other', label: 'Other', direction: 'in' },
] as const;

/**
 * A manual cash movement.
 *
 * Choosing a category sets the direction, because the two are almost never
 * independent: an owner contribution is money in, a refund is money out. It
 * stays overridable for the exceptions, but the default removes a decision
 * that is usually already made.
 */
export function LedgerSheet({ principals }: { principals: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('new');

  const [category, setCategory] = useState<string>('owner_contribution');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [currency, setCurrency] = useState<'USD' | 'SRD'>('USD');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const needsOwner = category === 'owner_contribution' || category === 'owner_draw';

  const { execute, isPending } = useAction(createLedgerEntry, {
    onSuccess({ data }) {
      toast.success(`Recorded ${data?.description}`);
      setOpen(false);
      setDescription('');
      setAmount('');
      setNotes('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the movement');
    },
  });

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Record movement
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Record a cash movement"
        description="For money that no document already accounts for. Payments for purchase orders and receipts from sales post themselves."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="ledger-form" pending={isPending}>
              Record
            </SubmitButton>
          </>
        }
      >
        <form
          id="ledger-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              direction,
              category: category as 'other',
              description,
              occurredAt,
              currency,
              amountCents: amount,
              paymentMethod: paymentMethod as 'cash',
              memberId: needsOwner ? memberId : null,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="What happened">
            <Field label="Category" htmlFor="category" required>
              <Select
                id="category"
                value={category}
                onChange={(event) => {
                  const next = event.target.value;
                  setCategory(next);
                  const match = CATEGORIES.find((entry) => entry.value === next);
                  if (match) setDirection(match.direction);
                }}
              >
                {CATEGORIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Direction"
              htmlFor="direction"
              hint={direction === 'in' ? 'Cash increases' : 'Cash decreases'}
            >
              <Select
                id="direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'in' | 'out')}
              >
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </Select>
            </Field>

            {needsOwner ? (
              <Field label="Owner" htmlFor="memberId" required>
                <Select
                  id="memberId"
                  value={memberId ?? ''}
                  required
                  onChange={(event) => setMemberId(event.target.value || null)}
                >
                  <option value="">Choose an owner</option>
                  {principals.map((principal) => (
                    <option key={principal.id} value={principal.id}>
                      {principal.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Description" htmlFor="description" required>
              <Input
                id="description"
                value={description}
                required
                placeholder="Opening capital"
                onChange={(event) => setDescription(event.target.value)}
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
              <Field label="Method" htmlFor="paymentMethod">
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
