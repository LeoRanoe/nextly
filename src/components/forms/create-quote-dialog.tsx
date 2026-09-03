'use client';

import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Item } from '@/components/ui/dropdown-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMoney, parseMoney } from '@/lib/money';
import { createQuoteFromRequest } from '@/server/actions/quotes';
import type { QuoteVariantOption } from '@/server/queries/quotes';

export function CreateQuoteDialog({
  requestId,
  requesterName,
  quantity,
  variants,
  inMenu = false,
}: {
  requestId: string;
  requesterName: string;
  quantity: number;
  variants: QuoteVariantOption[];
  inMenu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState('');
  const [price, setPrice] = useState('');
  const router = useRouter();
  const action = useAction(createQuoteFromRequest, {
    onSuccess: ({ data }) => {
      setOpen(false);
      const url = `${window.location.origin}/d/quote/${data?.token}`;
      navigator.clipboard?.writeText(url);
      toast.success(`${data?.number} created`, { description: 'Secure quote link copied.' });
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create the quote'),
  });
  const chosen = variants.find((v) => v.id === variantId);
  let cents = 0;
  try {
    cents = parseMoney(price || '0');
  } catch {
    cents = 0;
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (chosen && cents > 0)
      action.execute({ requestId, variantId: chosen.id, unitPriceCents: String(cents) });
  };
  const trigger = inMenu ? (
    <Item onSelect={() => setOpen(true)}>
      <FileText className="size-3.5" /> Create quote
    </Item>
  ) : (
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
      Create quote
    </Button>
  );
  return (
    <>
      {trigger}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Create quote / Offerte"
        description={`Prepare a customer quote for ${requesterName}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              form="create-quote"
              pending={action.isPending}
              disabled={!chosen || cents <= 0}
            >
              Create quote
            </SubmitButton>
          </>
        }
      >
        <form id="create-quote" onSubmit={submit}>
          <SheetSection title="Quoted item">
            <Field label="Variant" htmlFor="quote-variant" required>
              <Select
                id="quote-variant"
                value={variantId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  const next = variants.find((v) => v.id === event.target.value);
                  if (next) setPrice(formatMoney(next.listPriceCents, 'USD', { bare: true }));
                }}
              >
                <option value="">Choose a variant…</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.productName} · {v.variantName} · {v.sku}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit price (USD)" htmlFor="quote-price" required>
              <Input
                id="quote-price"
                numeric
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <p className="text-[12px] text-ink-3">
              {cents > 0
                ? `${formatMoney(cents * quantity)} for ${quantity} unit${quantity === 1 ? '' : 's'}. Valid for 14 days.`
                : 'The quote will use the requested quantity.'}
            </p>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
