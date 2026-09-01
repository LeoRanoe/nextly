'use client';

import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Money, Percent } from '@/components/ui/money';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { fromBase, type RateMicros, toBase } from '@/lib/fx';
import { formatMoney, mulDivRound, parseMoney, toDecimalString } from '@/lib/money';
import { createCustomer } from '@/server/actions/reference';
import { createSale, updateSale } from '@/server/actions/sales';
import type { Option, VariantOption } from '@/server/queries/pickers';

/**
 * Recording a sale.
 *
 * The design goal is that nobody has to leave this screen to answer a question
 * it raised. The product picker shows stock and price; the customer picker
 * creates a customer inline; and the margin panel recomputes on every
 * keystroke using exactly the arithmetic the server will use, so the number
 * shown before submitting is the number that gets stored.
 */

type Line = { key: string; variantId: string | null; quantity: string; unitPrice: string };

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: null,
  quantity: '1',
  unitPrice: '',
});

const today = () => new Date().toISOString().slice(0, 10);

export type SaleFormValues = {
  id: string;
  customerId: string | null;
  soldAt: string;
  currency: 'USD' | 'SRD';
  paymentMethod: string;
  notes: string;
  items: { variantId: string; quantity: string; unitPrice: string }[];
};

export function SaleForm({
  variants,
  customers,
  rateMicros,
  initial,
}: {
  variants: VariantOption[];
  customers: Option[];
  rateMicros: RateMicros;
  /** Omit for a blank form. Editing is only ever offered for a draft — see
   *  updateSale, which refuses anything else. */
  initial?: SaleFormValues;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [customerList, setCustomerList] = useState(customers);
  const [soldAt, setSoldAt] = useState(initial?.soldAt ?? today());
  const [currency, setCurrency] = useState<'USD' | 'SRD'>(initial?.currency ?? 'USD');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items.map((item) => ({
        key: crypto.randomUUID(),
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })) ?? [newLine()],
  );

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
        meta:
          variant.onHand > 0
            ? `${variant.onHand} on hand`
            : variant.onHand < 0
              ? `${variant.onHand} — oversold`
              : 'none left',
        disabled: !variant.isActive,
      })),
    [variants],
  );

  const customerOptions: ComboboxOption[] = customerList.map((customer) => ({
    value: customer.id,
    label: customer.label,
    hint: customer.hint ?? undefined,
  }));

  /**
   * Totals, computed the way the server computes them.
   *
   * Cost of goods uses `round(value x n / q)` per line — the same weighted
   * average call the posting service makes — rather than multiplying a rounded
   * unit cost, so the margin shown here does not shift by a cent on submit.
   */
  const totals = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    let units = 0;
    const shortfalls: { label: string; short: number }[] = [];

    for (const line of lines) {
      const variant = line.variantId ? byId.get(line.variantId) : undefined;
      if (!variant) continue;

      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      let unitPrice = 0;
      try {
        unitPrice = parseMoney(line.unitPrice || '0');
      } catch {
        unitPrice = 0;
      }

      // Normalise the line total through the exact integer path, the same way
      // the action will. A float divide here would drift from what gets stored.
      const lineRevenue = unitPrice * quantity;
      revenue += currency === 'SRD' ? toBase(lineRevenue, rateMicros) : lineRevenue;
      units += quantity;

      if (variant.onHand > 0) {
        const consumable = Math.min(quantity, variant.onHand);
        cogs +=
          consumable === variant.onHand
            ? variant.valueCents
            : mulDivRound(variant.valueCents, consumable, variant.onHand);
      }

      if (quantity > Math.max(variant.onHand, 0)) {
        shortfalls.push({
          label: `${variant.productName} · ${variant.variantName}`,
          short: quantity - Math.max(variant.onHand, 0),
        });
      }
    }

    return { revenue, cogs, gross: revenue - cogs, units, shortfalls };
  }, [lines, byId, currency, rateMicros]);

  // Two hook calls, always both — createSale and updateSale have different
  // input schemas (update adds `id`), and TypeScript cannot always assign
  // that union to useAction's single expected function type. See the
  // matching comment in forms/reference-sheets.tsx for the full reasoning.
  const createHook = useAction(createSale, {
    onSuccess({ data }) {
      toast.success(`Sale ${data?.number} recorded`, {
        description: data
          ? `${formatMoney(data.totalUsdCents)} revenue · ${formatMoney(
              data.totalUsdCents - data.cogsCents,
            )} gross profit`
          : undefined,
      });
      router.push('/sales');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not record the sale', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });
  const updateHook = useAction(updateSale, {
    onSuccess({ data }) {
      toast.success(`Sale ${data?.number} updated`);
      router.push(`/sales/${data?.id}` as Parameters<typeof router.push>[0]);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the sale', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  const createInlineCustomer = useAction(createCustomer, {
    onSuccess({ data }) {
      if (!data) return;
      setCustomerList((current) => [
        ...current,
        { id: data.id, label: data.name, hint: data.code },
      ]);
      setCustomerId(data.id);
      toast.success(`Customer ${data.name} created`);
    },
    onError() {
      toast.error('Could not create that customer');
    },
  });

  function submit(confirm: boolean) {
    const items = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId as string,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice || '0',
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
      customerId,
      soldAt,
      currency,
      paymentMethod: paymentMethod as 'cash',
      notes: notes || undefined,
      confirm,
      items,
    } as never);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(true);
      }}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start"
    >
      <div className="space-y-4">
        <Surface>
          <SurfaceHeader title="Sale" />
          <div className="space-y-3 p-4">
            <Field label="Customer" htmlFor="customer" hint="Leave empty for a walk-in">
              <Combobox
                id="customer"
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Walk-in customer"
                searchPlaceholder="Search customers"
                emptyLabel="No customers match."
                createLabel="Add customer"
                onCreate={(name) => createInlineCustomer.execute({ name })}
              />
            </Field>

            <FieldRow>
              <Field label="Date" htmlFor="soldAt" required>
                <Input
                  id="soldAt"
                  type="date"
                  value={soldAt}
                  max={today()}
                  onChange={(event) => setSoldAt(event.target.value)}
                  required
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

            <Field
              label="Currency"
              htmlFor="currency"
              hint={
                currency === 'SRD'
                  ? `Converted at ${(rateMicros / 1_000_000).toFixed(2)} SRD per USD`
                  : 'The books are kept in USD'
              }
            >
              <Select
                id="currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'USD' | 'SRD')}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="SRD">SRD — Surinamese Dollar</option>
              </Select>
            </Field>
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Items"
            hint="Prices default to the list price and can be overridden"
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
            {lines.map((line, index) => {
              const variant = line.variantId ? byId.get(line.variantId) : undefined;
              const quantity = Number.parseInt(line.quantity, 10) || 0;
              const oversold = variant ? quantity > Math.max(variant.onHand, 0) : false;

              return (
                <div
                  key={line.key}
                  className="grid gap-2 p-4 sm:grid-cols-[1fr_88px_120px_32px]"
                >
                  <Field label={index === 0 ? 'Product' : ''} htmlFor={`variant-${line.key}`}>
                    <Combobox
                      id={`variant-${line.key}`}
                      options={variantOptions}
                      value={line.variantId}
                      onChange={(value) => {
                        const picked = value ? byId.get(value) : undefined;
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? {
                                  ...candidate,
                                  variantId: value,
                                  // Prefill from the price list, in the sale's
                                  // currency, so the common case is one click.
                                  unitPrice: picked
                                    ? toDecimalString(
                                        currency === 'SRD'
                                          ? fromBase(picked.listPriceCents, rateMicros)
                                          : picked.listPriceCents,
                                      )
                                    : candidate.unitPrice,
                                }
                              : candidate,
                          ),
                        );
                      }}
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
                      aria-invalid={oversold}
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

                  <Field
                    label={index === 0 ? `Unit (${currency})` : ''}
                    htmlFor={`price-${line.key}`}
                  >
                    <Input
                      id={`price-${line.key}`}
                      numeric
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? { ...candidate, unitPrice: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </Field>

                  <div
                    className={cn('flex', index === 0 ? 'items-end pb-0.5' : 'items-center')}
                  >
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

                  {oversold && variant ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-warning sm:col-span-4">
                      <AlertTriangle className="size-3" />
                      Only {Math.max(variant.onHand, 0)} on hand. The sale will still record,
                      and the shortfall will be flagged.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader title="Notes" />
          <div className="p-4">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering about this sale"
              aria-label="Notes"
            />
          </div>
        </Surface>
      </div>

      <Surface className="xl:sticky xl:top-20">
        <SurfaceHeader title="Margin" hint="Recomputed as you type" />
        <dl className="space-y-2 p-4">
          <Row label="Units" value={String(totals.units)} />
          <Row label="Revenue" value={formatMoney(totals.revenue)} />
          <Row label="Cost of goods" value={formatMoney(totals.cogs)} muted />
          <div className="border-line-subtle border-t pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-ink-2">Gross profit</dt>
              <dd>
                <Money cents={totals.gross} tone="flow" size="lg" />
              </dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-ink-4">Margin</dt>
              <dd>
                <Percent
                  value={totals.revenue === 0 ? 0 : totals.gross / totals.revenue}
                  tone="muted"
                />
              </dd>
            </div>
          </div>

          {currency === 'SRD' ? (
            <p className="border-line-subtle border-t pt-2 text-[11px] text-ink-4">
              Charged in SRD at {(rateMicros / 1_000_000).toFixed(2)}. The books record{' '}
              {formatMoney(totals.revenue)}.
            </p>
          ) : null}

          {totals.shortfalls.length > 0 ? (
            <div className="rounded-control border border-warning/40 bg-warning-muted p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="size-3 shrink-0" />
                Selling more than is in stock
              </p>
              <ul className="mt-1 space-y-0.5">
                {totals.shortfalls.map((entry) => (
                  <li key={entry.label} className="text-[11px] text-ink-3">
                    {entry.label}: {entry.short} short
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-4">
                Those units have no cost yet, so the margin above is overstated until a purchase
                order covers them.
              </p>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2 border-line-subtle border-t p-4">
          <SubmitButton pending={isPending} size="lg" className="w-full">
            {isEdit ? 'Save and confirm' : 'Record sale'}
          </SubmitButton>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => submit(false)}
          >
            Save as draft
          </Button>
          <p className="text-[11px] text-ink-4 leading-relaxed">
            {isEdit
              ? 'Confirming moves stock, books the cost of goods and posts the receipt. Saving as a draft keeps none of that until it is confirmed.'
              : 'Recording moves stock, books the cost of goods and posts the receipt to the cash ledger. A draft does none of that until it is confirmed.'}
          </p>
        </div>
      </Surface>
    </form>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cn('tabular text-[13px]', muted ? 'text-ink-3' : 'text-ink')}>{value}</dd>
    </div>
  );
}
