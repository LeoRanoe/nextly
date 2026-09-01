'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Textarea } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { allocateOverhead } from '@/lib/costing';
import { formatMoney, parseMoney } from '@/lib/money';
import { createPurchaseOrder, updatePurchaseOrder } from '@/server/actions/purchase-orders';
import { createSupplier } from '@/server/actions/reference';
import type { Option, VariantOption } from '@/server/queries/pickers';

/**
 * Raising a purchase order.
 *
 * The overhead fields are the reason this screen exists. As soon as they are
 * filled in, the panel on the right shows what each line will actually cost per
 * unit once freight and fees are allocated — before the order is even placed.
 * That preview is the number the spreadsheet never computed, and seeing it at
 * order time is what makes it possible to price properly.
 */

type Line = { key: string; variantId: string | null; quantity: string; subtotal: string };

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: null,
  quantity: '1',
  subtotal: '',
});

const today = () => new Date().toISOString().slice(0, 10);

const money = (value: string): number => {
  try {
    return parseMoney(value || '0');
  } catch {
    return 0;
  }
};

export type PurchaseOrderFormValues = {
  id: string;
  supplierId: string | null;
  orderedAt: string;
  expectedAt: string;
  reference: string;
  notes: string;
  taxCents: string;
  cardFeeCents: string;
  deliveryCents: string;
  shippingCents: string;
  shippingTaxCents: string;
  items: { variantId: string; quantity: string; subtotal: string }[];
};

export function PurchaseOrderForm({
  variants,
  suppliers,
  initial,
}: {
  variants: VariantOption[];
  suppliers: Option[];
  /** Omit for a blank form. Editing is only offered for draft/ordered/shipped
   *  orders — see updatePurchaseOrder, which refuses anything else. */
  initial?: PurchaseOrderFormValues;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [supplierId, setSupplierId] = useState<string | null>(initial?.supplierId ?? null);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [orderedAt, setOrderedAt] = useState(initial?.orderedAt ?? today());
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt ?? '');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items.map((item) => ({
        key: crypto.randomUUID(),
        variantId: item.variantId,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })) ?? [newLine()],
  );

  const [tax, setTax] = useState(initial?.taxCents ?? '');
  const [cardFee, setCardFee] = useState(initial?.cardFeeCents ?? '');
  const [delivery, setDelivery] = useState(initial?.deliveryCents ?? '');
  const [shipping, setShipping] = useState(initial?.shippingCents ?? '');
  const [shippingTax, setShippingTax] = useState(initial?.shippingTaxCents ?? '');

  const byId = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );

  const variantOptions: ComboboxOption[] = useMemo(
    () =>
      variants.map((variant) => ({
        value: variant.id,
        label: `${variant.productName} · ${variant.variantName}`,
        hint: variant.sku,
        meta: `${variant.onHand} on hand`,
      })),
    [variants],
  );

  /** The landed-cost preview, using the same allocator the server will run. */
  const preview = useMemo(() => {
    const overhead =
      money(tax) + money(cardFee) + money(delivery) + money(shipping) + money(shippingTax);

    const usable = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        id: line.key,
        subtotalCents: money(line.subtotal),
        quantity: Number.parseInt(line.quantity, 10) || 0,
      }));

    const goods = usable.reduce((sum, line) => sum + line.subtotalCents, 0);
    const allocated = allocateOverhead(usable, overhead);

    const rows = allocated.map((line) => {
      const source = lines.find((candidate) => candidate.key === line.id);
      const variant = source?.variantId ? byId.get(source.variantId) : undefined;
      return {
        key: line.id,
        label: variant ? `${variant.productName} · ${variant.variantName}` : 'Unassigned',
        quantity: line.quantity,
        subtotalCents: line.subtotalCents,
        overheadCents: line.overheadCents,
        landedCostCents: line.landedCostCents,
        unitCost: line.quantity > 0 ? line.landedCostCents / line.quantity / 100 : null,
        listCostCents: variant?.referenceCostCents ?? 0,
      };
    });

    return { overhead, goods, total: goods + overhead, rows };
  }, [lines, byId, tax, cardFee, delivery, shipping, shippingTax]);

  // Two hook calls, always both — createPurchaseOrder and
  // updatePurchaseOrder have different input schemas (update adds `id`), and
  // TypeScript cannot always assign that union to useAction's single
  // expected function type. See the matching comment in
  // forms/reference-sheets.tsx for the full reasoning.
  const createHook = useAction(createPurchaseOrder, {
    onSuccess({ data }) {
      toast.success(`Purchase order ${data?.number} raised`, {
        description: 'Mark it received when the goods arrive to allocate freight and fees.',
      });
      router.push('/purchase-orders');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not raise the order');
    },
  });
  const updateHook = useAction(updatePurchaseOrder, {
    onSuccess({ data }) {
      toast.success(`Purchase order ${data?.number} updated`);
      router.push(`/purchase-orders/${data?.id}` as Parameters<typeof router.push>[0]);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the order');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  const createInlineSupplier = useAction(createSupplier, {
    onSuccess({ data }) {
      if (!data) return;
      setSupplierList((current) => [...current, { id: data.id, label: data.name }]);
      setSupplierId(data.id);
      toast.success(`Supplier ${data.name} added`);
    },
    onError() {
      toast.error('Could not add that supplier');
    },
  });

  function submit() {
    const items = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId as string,
        quantity: line.quantity,
        subtotalCents: line.subtotal || '0',
      }));

    if (items.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    // `execute` is a union of the create and update action's own function
    // types — the branch above already guarantees the right shape reaches
    // the right action.
    execute({
      ...(isEdit ? { id: initial?.id as string } : {}),
      supplierId,
      orderedAt,
      expectedAt: expectedAt || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
      taxCents: tax || '0',
      cardFeeCents: cardFee || '0',
      deliveryCents: delivery || '0',
      shippingCents: shipping || '0',
      shippingTaxCents: shippingTax || '0',
      items,
    } as never);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start"
    >
      <div className="space-y-4">
        <Surface>
          <SurfaceHeader title="Order" />
          <div className="space-y-3 p-4">
            <Field label="Supplier" htmlFor="supplier">
              <Combobox
                id="supplier"
                options={supplierList.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.label,
                  hint: supplier.hint ?? undefined,
                }))}
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Choose a supplier"
                searchPlaceholder="Search suppliers"
                createLabel="Add supplier"
                onCreate={(name) => createInlineSupplier.execute({ name, kind: 'other' })}
              />
            </Field>

            <FieldRow>
              <Field label="Ordered" htmlFor="orderedAt" required>
                <Input
                  id="orderedAt"
                  type="date"
                  value={orderedAt}
                  onChange={(event) => setOrderedAt(event.target.value)}
                  required
                />
              </Field>
              <Field label="Expected" htmlFor="expectedAt" hint="Optional">
                <Input
                  id="expectedAt"
                  type="date"
                  value={expectedAt}
                  onChange={(event) => setExpectedAt(event.target.value)}
                />
              </Field>
            </FieldRow>

            <Field label="Reference" htmlFor="reference" hint="Supplier order number">
              <Input
                id="reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="112-3456789-1234567"
              />
            </Field>
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Items"
            hint="Enter the line total for the goods, before shipping"
            action={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                <Plus className="size-3.5" /> Add line
              </Button>
            }
          />
          <div className="divide-y divide-line-subtle">
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-2 p-4 sm:grid-cols-[1fr_88px_120px_32px]">
                <Field label={index === 0 ? 'Product' : ''} htmlFor={`variant-${line.key}`}>
                  <Combobox
                    id={`variant-${line.key}`}
                    options={variantOptions}
                    value={line.variantId}
                    onChange={(value) =>
                      setLines((current) =>
                        current.map((candidate) =>
                          candidate.key === line.key
                            ? { ...candidate, variantId: value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder="Choose a product"
                    searchPlaceholder="Search by name or SKU"
                  />
                </Field>

                <Field label={index === 0 ? 'Qty' : ''} htmlFor={`qty-${line.key}`}>
                  <Input
                    id={`qty-${line.key}`}
                    numeric
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate) =>
                          candidate.key === line.key
                            ? { ...candidate, quantity: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                </Field>

                <Field label={index === 0 ? 'Goods (USD)' : ''} htmlFor={`sub-${line.key}`}>
                  <Input
                    id={`sub-${line.key}`}
                    numeric
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.subtotal}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate) =>
                          candidate.key === line.key
                            ? { ...candidate, subtotal: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                </Field>

                <div className={cn('flex', index === 0 ? 'items-end pb-0.5' : 'items-center')}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((candidate) => candidate.key !== line.key),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Freight, tax and fees"
            hint="These are costs of the goods, not general expenses. They are allocated across the lines on receipt."
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Shipping" htmlFor="shipping">
              <Input
                id="shipping"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={shipping}
                onChange={(event) => setShipping(event.target.value)}
              />
            </Field>
            <Field label="Shipping tax" htmlFor="shippingTax">
              <Input
                id="shippingTax"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={shippingTax}
                onChange={(event) => setShippingTax(event.target.value)}
              />
            </Field>
            <Field label="Sales tax" htmlFor="tax">
              <Input
                id="tax"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
              />
            </Field>
            <Field label="Card fee" htmlFor="cardFee">
              <Input
                id="cardFee"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={cardFee}
                onChange={(event) => setCardFee(event.target.value)}
              />
            </Field>
            <Field label="Delivery" htmlFor="delivery">
              <Input
                id="delivery"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={delivery}
                onChange={(event) => setDelivery(event.target.value)}
              />
            </Field>
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader title="Notes" />
          <div className="p-4">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering about this order"
              aria-label="Notes"
            />
          </div>
        </Surface>
      </div>

      <Surface className="xl:sticky xl:top-20">
        <SurfaceHeader
          title="Landed cost"
          hint="What each unit will really cost once freight is allocated"
        />
        <dl className="space-y-2 border-line-subtle border-b p-4">
          <Row label="Goods" value={formatMoney(preview.goods)} />
          <Row label="Freight, tax and fees" value={formatMoney(preview.overhead)} />
          <div className="flex items-baseline justify-between gap-3 border-line-subtle border-t pt-2">
            <dt className="text-[13px] text-ink-2">Order total</dt>
            <dd>
              <Money cents={preview.total} size="lg" />
            </dd>
          </div>
        </dl>

        {preview.rows.length > 0 ? (
          <ul className="divide-y divide-line-subtle">
            {preview.rows.map((row) => (
              <li key={row.key} className="px-4 py-3">
                <p className="truncate text-[12px] text-ink-2">{row.label}</p>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-ink-4">{row.quantity} × landed</span>
                  <span className="tabular text-[14px] text-ink">
                    {row.unitCost === null ? '—' : `$${row.unitCost.toFixed(4)}`}
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-ink-4">
                  <span>+{formatMoney(row.overheadCents)} freight</span>
                  {row.listCostCents > 0 && row.unitCost !== null ? (
                    <span>list {formatMoney(row.listCostCents)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-[12px] text-ink-4">
            Add an item to see what it will cost to land.
          </p>
        )}

        <div className="flex flex-col gap-2 border-line-subtle border-t p-4">
          <SubmitButton pending={isPending} size="lg" className="w-full">
            {isEdit ? 'Save changes' : 'Raise order'}
          </SubmitButton>
          <p className="text-[11px] text-ink-4 leading-relaxed">
            {isEdit
              ? 'Still safe to edit: nothing has moved stock or cash yet. That happens when the order is marked received, after which it can no longer be edited.'
              : 'Raising the order does not move stock or cash. Both happen when you mark it received.'}
          </p>
        </div>
      </Surface>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="tabular text-[13px] text-ink">{value}</dd>
    </div>
  );
}
