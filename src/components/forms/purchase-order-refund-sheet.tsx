'use client';

import { Banknote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import type { Cents, CurrencyCode } from '@/lib/money';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import { refundPurchaseOrder } from '@/server/actions/purchase-orders';

/** Record money returned by a supplier without rewriting the original payment. */
export function PurchaseOrderRefundSheet({
  orderId,
  number,
  currency,
  refundableCents,
}: {
  orderId: string;
  number: string;
  currency: CurrencyCode;
  refundableCents: Cents;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(toDecimalString(refundableCents, currency));
  const [method, setMethod] = useState('bank_transfer');
  const [refundedAt, setRefundedAt] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const formId = useId();

  let parsed: Cents = 0;
  try {
    parsed = parseMoney(amount || '0');
  } catch {
    parsed = 0;
  }
  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;

  const action = useAction(refundPurchaseOrder, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(`${formatMoney(data.amountCents, currency)} supplier refund recorded`, {
        description:
          data.refundableCents > 0
            ? `${formatMoney(data.refundableCents, currency)} remains refundable.`
            : 'All paid supplier money has been refunded.',
      });
      setOpen(false);
      setReason('');
      setIdempotencyKey(undefined);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the supplier refund');
    },
  });

  if (refundableCents <= 0) return null;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Banknote className="size-3.5" /> Record refund
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Supplier refund for ${number}`}
        description={`Up to ${formatMoney(refundableCents, currency)} has been paid and can be returned by the supplier. This action records the cash coming back.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              form={formId}
              variant="primary"
              pending={action.isPending}
              disabled={parsed <= 0}
            >
              Record refund
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed <= 0 || parsed > refundableCents) {
              toast.error(
                `Enter an amount between 0.01 and ${formatMoney(refundableCents, currency)}`,
              );
              return;
            }
            const key = idempotencyKey ?? crypto.randomUUID();
            setIdempotencyKey(key);
            action.execute({
              orderId,
              amountCents: String(parsed),
              paymentMethod: method as 'cash',
              refundedAt: refundedAt || undefined,
              reason,
              idempotencyKey: key,
            });
          }}
        >
          <SheetSection title="Refund">
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
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Date received" htmlFor={`${formId}-date`} hint="Empty means today">
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={refundedAt}
                  onChange={(event) => setRefundedAt(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Reason" htmlFor={`${formId}-reason`} required>
              <Textarea
                id={`${formId}-reason`}
                value={reason}
                required
                minLength={3}
                placeholder="Supplier refunded a damaged unit"
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
