'use client';

import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { type CurrencyCode, formatMoney } from '@/lib/money';
import { returnSaleItems } from '@/server/actions/sales';

export type ReturnableItem = {
  id: string;
  label: string;
  sku: string;
  quantity: number;
  quantityReturned: number;
  unitPriceCents: number;
};

/**
 * The return flow.
 *
 * Refund and restock are derived from the original line — the price it was
 * charged at and the cost it left stock at — never typed in, so a return
 * cannot drift from the sale it reverses. The reason is required: this
 * reverses postings, the same tier of friction as voiding.
 */
export function ReturnSheet({
  saleId,
  number,
  currency,
  items,
}: {
  saleId: string;
  number: string;
  currency: CurrencyCode;
  items: ReturnableItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const formId = useId();
  const reasonId = useId();

  const { execute, isPending } = useAction(returnSaleItems, {
    onSuccess({ data }) {
      toast.success(`${data?.number} return recorded`, {
        description: data
          ? `${formatMoney(data.creditCents, data.currency)} credit created, ${data.units} unit${data.units === 1 ? '' : 's'} back in stock. Refund it separately when the cash leaves.`
          : undefined,
      });
      setOpen(false);
      setQuantities({});
      setReason('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the return');
    },
  });

  const returnable = (item: ReturnableItem) => item.quantity - item.quantityReturned;

  const chosen = items
    .map((item) => ({
      saleItemId: item.id,
      quantity: Math.max(0, Math.min(Number(quantities[item.id] ?? 0) || 0, returnable(item))),
    }))
    .filter((line) => line.quantity > 0);

  const refundCents = chosen.reduce((total, line) => {
    const item = items.find((candidate) => candidate.id === line.saleItemId);
    return total + (item ? item.unitPriceCents * line.quantity : 0);
  }, 0);

  const anyReturnable = items.some((item) => returnable(item) > 0);
  if (!anyReturnable) return null;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Undo2 className="size-3.5" /> Return items
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Return items from ${number}`}
        description="The sale stays exactly as it was. The goods come back into stock at the cost they left at, and a credit is created. Refund it separately when cash actually leaves."
        footer={
          <>
            <span className="tabular mr-auto text-[13px] text-ink">
              {chosen.length > 0
                ? `Credit ${formatMoney(refundCents, currency)}`
                : 'Nothing selected'}
            </span>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} variant="danger" pending={isPending}>
              Record return
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (chosen.length === 0) {
              toast.error('Pick at least one unit to return');
              return;
            }
            execute({ saleId, reason, items: chosen });
          }}
        >
          <SheetSection title="Items" hint="Units to return from each line">
            <div className="space-y-2">
              {items.map((item) => {
                const left = returnable(item);
                const inputId = `${formId}-${item.id}`;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-inset px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-ink">{item.label}</p>
                      <p className="tabular mt-0.5 text-[11px] text-ink-4">
                        {left > 0
                          ? `${left} of ${item.quantity} returnable · ${formatMoney(item.unitPriceCents, currency)} each`
                          : `Fully returned (${item.quantity} of ${item.quantity})`}
                      </p>
                    </div>
                    <label htmlFor={inputId} className="sr-only">
                      Units to return — {item.label}
                    </label>
                    <Input
                      id={inputId}
                      numeric
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={left}
                      disabled={left === 0}
                      placeholder="0"
                      className="w-20 shrink-0"
                      value={quantities[item.id] ?? ''}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </SheetSection>

          <SheetSection title="Reason">
            <Field
              label="Why the goods came back"
              htmlFor={reasonId}
              hint="Recorded on the return history"
              required
            >
              <Textarea
                id={reasonId}
                value={reason}
                required
                minLength={3}
                placeholder="Customer reported the camera would not pair"
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
