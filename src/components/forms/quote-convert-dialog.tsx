'use client';

import { ArrowRightLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Item } from '@/components/ui/dropdown-menu';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMoney, parseMoney } from '@/lib/money';
import { convertQuoteRequestToSale } from '@/server/actions/quotes';
import type { QuoteVariantOption } from '@/server/queries/quotes';

/**
 * Convert a quote request into a draft sale (F-5).
 *
 * The visitor asked about a *product*; an owner decides which variant was
 * actually quoted and at what price. The variant list is grouped by product so
 * a long catalog stays scannable in a native select. Picking a variant
 * pre-fills the unit price with its list price — the owner haggles from there,
 * and the number is never left to memory.
 */
export function ConvertQuoteDialog({
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
  /** Set when this dialog is rendered as a child of `ui/dropdown-menu`'s
   *  `Menu`, so its trigger becomes a menu item instead of a button. */
  inMenu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState('');
  const [price, setPrice] = useState('');
  const formId = useId();
  const router = useRouter();

  const convert = useAction(convertQuoteRequestToSale, {
    onSuccess: ({ data }) => {
      setOpen(false);
      toast.success(`Draft sale ${data?.number} created`, {
        description: `${requesterName} was added as a customer. Confirm the sale when the money is agreed.`,
      });
      router.push(`/sales/${data?.saleId}`);
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not convert the request', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });

  const chosen = variants.find((variant) => variant.id === variantId);

  let unitCents = 0;
  try {
    unitCents = parseMoney(price || '0');
  } catch {
    unitCents = 0;
  }
  if (!Number.isFinite(unitCents) || unitCents <= 0) unitCents = 0;

  // Group once per render into insertion order (the query sorts by product
  // name), emitting one <optgroup> per product.
  const groups = new Map<string, QuoteVariantOption[]>();
  for (const variant of variants) {
    const bucket = groups.get(variant.productName);
    if (bucket) bucket.push(variant);
    else groups.set(variant.productName, [variant]);
  }

  return (
    <>
      {/* Rendered inside a row-action Menu, so the trigger is a menu item;
       *  standalone callers get the plain button instead. */}
      {inMenu ? (
        <Item onSelect={() => setOpen(true)}>
          <ArrowRightLeft className="size-3.5" />
          Convert to sale
        </Item>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Convert to sale
        </Button>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Convert to draft sale"
        description={`Creates a customer for ${requesterName} and a draft sale for ${quantity} ${quantity === 1 ? 'unit' : 'units'}. Nothing posts until you confirm the sale.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              form={formId}
              pending={convert.isPending}
              disabled={!chosen || unitCents <= 0}
            >
              Create draft sale
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (!chosen || unitCents <= 0) return;
            convert.execute({
              id: requestId,
              variantId: chosen.id,
              unitPriceCents: String(unitCents),
            });
          }}
        >
          <SheetSection title="What was quoted">
            <Field label="Variant" htmlFor={`${formId}-variant`} required>
              <Select
                id={`${formId}-variant`}
                value={variantId}
                onChange={(event) => {
                  const next = event.target.value;
                  setVariantId(next);
                  const variant = variants.find((candidate) => candidate.id === next);
                  if (variant)
                    setPrice(formatMoney(variant.listPriceCents, 'USD', { bare: true }));
                }}
              >
                <option value="">Choose a variant…</option>
                {[...groups.entries()].map(([productName, options]) => (
                  <optgroup key={productName} label={productName}>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.variantName} · {option.sku}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field
              label="Unit price (USD)"
              htmlFor={`${formId}-price`}
              required
              hint={chosen ? `List price ${formatMoney(chosen.listPriceCents)}` : undefined}
            >
              <Input
                id={`${formId}-price`}
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={!chosen}
              />
            </Field>
            {unitCents > 0 ? (
              <p className="text-[12px] text-ink-3">
                Total{' '}
                <span className="tabular text-ink">{formatMoney(unitCents * quantity)}</span>{' '}
                for {quantity} {quantity === 1 ? 'unit' : 'units'}.
              </p>
            ) : null}
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
