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
import type { BundleOption, Option, VariantOption } from '@/server/queries/pickers';

/**
 * Recording a sale.
 *
 * The design goal is that nobody has to leave this screen to answer a question
 * it raised. The product picker shows stock and price; the customer picker
 * creates a customer inline; and the margin panel recomputes on every
 * keystroke using exactly the arithmetic the server will use, so the number
 * shown before submitting is the number that gets stored.
 */

type Line = {
  key: string;
  variantId: string | null;
  bundleId: string | null;
  quantity: string;
  unitPrice: string;
  /** F-6: raw textarea contents — one serial per line, parsed on submit. */
  serials: string;
};

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: null,
  bundleId: null,
  quantity: '1',
  unitPrice: '',
  serials: '',
});

/** Textarea contents → the `string[]` the schema expects: trimmed, blanks
 *  dropped. Dedup happens server-side (schemas.ts) so this stays cheap. */
const parseSerials = (value: string): string[] =>
  value
    .split('\n')
    .map((serial) => serial.trim())
    .filter(Boolean);

const today = () => new Date().toISOString().slice(0, 10);

export type SaleFormValues = {
  id: string;
  customerId: string | null;
  soldAt: string;
  currency: 'USD' | 'SRD';
  paymentMethod: string;
  notes: string;
  discount: string;
  discountReason: string;
  items: {
    variantId: string;
    bundleId?: string | null;
    quantity: string;
    unitPrice: string;
    serials: string;
  }[];
};

export function SaleForm({
  variants,
  customers,
  rateMicros,
  bundles = [],
  initial,
}: {
  variants: VariantOption[];
  customers: Option[];
  rateMicros: RateMicros;
  bundles?: BundleOption[];
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
  const [discount, setDiscount] = useState(initial?.discount ?? '');
  const [discountReason, setDiscountReason] = useState(initial?.discountReason ?? '');
  /** F-4: confirming can either take the money now (the one-click default that
   *  matches how most sales close) or put the sale on credit with an optional
   *  deposit. Only consulted when the form confirms — a draft pays nothing. */
  const [paidInFull, setPaidInFull] = useState(true);
  const [deposit, setDeposit] = useState('');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items.map((item) => ({
        key: crypto.randomUUID(),
        variantId: item.variantId,
        bundleId: item.bundleId ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        serials: item.serials,
      })) ?? [newLine()],
  );

  const byId = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const bundleById = useMemo(
    () => new Map(bundles.map((bundle) => [bundle.id, bundle])),
    [bundles],
  );

  const variantOptions: ComboboxOption[] = useMemo(
    () => [
      ...variants.map((variant) => ({
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
      ...bundles.map((bundle) => ({
        value: `bundle:${bundle.id}`,
        label: `Bundle · ${bundle.name}`,
        hint: bundle.sku,
        meta: `${bundle.availability} available`,
      })),
    ],
    [variants, bundles],
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
   *
   * `gross` is the sum of the lines; `revenue` is gross less the discount. The
   * discount lives on the document, never in the line prices, so the products
   * keep recording what they actually sold for.
   */
  const totals = useMemo(() => {
    let gross = 0;
    let cogs = 0;
    let units = 0;
    const shortfalls: { label: string; short: number }[] = [];

    // Carry a running position so repeated variants consume stock sequentially
    // rather than each reading the original onHand/valueCents. Without this,
    // the client margin drifts from the server when the same variant appears
    // twice and the first line exhausts the stock.
    const position = new Map(
      variants.map((v) => [v.id, { qty: v.onHand, value: v.valueCents }]),
    );

    for (const line of lines) {
      const variant = line.variantId ? byId.get(line.variantId) : undefined;
      const bundle = line.bundleId ? bundleById.get(line.bundleId) : undefined;
      if (!variant && !bundle) continue;

      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      let unitPrice = 0;
      try {
        unitPrice = parseMoney(line.unitPrice || '0');
      } catch {
        unitPrice = 0;
      }

      const lineRevenue = unitPrice * quantity;
      gross += currency === 'SRD' ? toBase(lineRevenue, rateMicros) : lineRevenue;
      units += quantity;

      const components =
        bundle?.components ??
        (variant
          ? [
              {
                variantId: variant.id,
                quantity: 1,
                productName: variant.productName,
                variantName: variant.variantName,
              },
            ]
          : []);
      for (const component of components) {
        const pos = position.get(component.variantId);
        if (!pos) continue;
        const needed = quantity * component.quantity;
        const take = Math.min(needed, Math.max(pos.qty, 0));
        const cost = take === pos.qty ? pos.value : mulDivRound(pos.value, take, pos.qty);
        cogs += cost;
        position.set(component.variantId, { qty: pos.qty - needed, value: pos.value - cost });
        if (needed > take)
          shortfalls.push({
            label: bundle?.name ?? `${component.productName} · ${component.variantName}`,
            short: needed - take,
          });
      }
    }

    let discountUsd = 0;
    try {
      const parsed = parseMoney(discount || '0');
      discountUsd = currency === 'SRD' ? toBase(parsed, rateMicros) : parsed;
    } catch {
      discountUsd = 0;
    }
    // Clamped here so the panel cannot show a negative revenue while the
    // field is mid-edit; the server's schema rejects an oversized discount.
    discountUsd = Math.min(Math.max(discountUsd, 0), gross);

    const revenue = gross - discountUsd;
    return {
      gross,
      revenue,
      discount: discountUsd,
      cogs,
      profit: revenue - cogs,
      units,
      shortfalls,
    };
  }, [lines, byId, bundleById, currency, rateMicros, variants, discount]);

  /** Native-currency total: sum of line totals less the discount, both in the
   *  sale's currency. `paidNowCents` is a payment on this number, not on the
   *  USD revenue below — the ledger receives the native amount and converts it
   *  at the rate frozen on the sale. */
  const nativeTotal = useMemo(() => {
    let grossNative = 0;
    for (const line of lines) {
      if (!line.variantId) continue;
      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      let unitPrice = 0;
      try {
        unitPrice = parseMoney(line.unitPrice || '0');
      } catch {
        unitPrice = 0;
      }
      grossNative += unitPrice * quantity;
    }
    let discountNative = 0;
    try {
      discountNative = parseMoney(discount || '0');
    } catch {
      discountNative = 0;
    }
    return Math.max(0, grossNative - Math.min(discountNative, grossNative));
  }, [lines, discount]);

  let depositInput = 0;
  try {
    depositInput = parseMoney(deposit || '0');
  } catch {
    depositInput = 0;
  }
  if (!Number.isFinite(depositInput) || depositInput < 0) depositInput = 0;
  const depositCents = Math.min(depositInput, nativeTotal);

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
        bundleId: line.bundleId,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice || '0',
        serials: parseSerials(line.serials),
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
      discountCents: discount || '0',
      discountReason: discountReason || undefined,
      confirm,
      paidInFull: !confirm || paidInFull,
      paidNowCents: String(confirm && !paidInFull ? depositCents : 0),
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
          />
          <div className="divide-y divide-line-subtle">
            {lines.map((line, index) => {
              const variant = line.variantId ? byId.get(line.variantId) : undefined;
              const bundle = line.bundleId ? bundleById.get(line.bundleId) : undefined;
              const quantity = Number.parseInt(line.quantity, 10) || 0;
              const oversold = bundle
                ? quantity > bundle.availability
                : variant
                  ? quantity > Math.max(variant.onHand, 0)
                  : false;

              let unitPrice = 0;
              try {
                unitPrice = parseMoney(line.unitPrice || '0');
              } catch {
                unitPrice = 0;
              }
              const lineTotal = unitPrice * quantity;

              return (
                <div
                  key={line.key}
                  className="grid gap-2 p-4 sm:grid-cols-[24px_1fr_72px_100px_100px_32px]"
                >
                  {index === 0 ? (
                    <span className="hidden text-[11px] text-ink-4 uppercase tracking-[0.06em] sm:block" />
                  ) : null}
                  <span className="hidden self-center tabular text-[12px] text-ink-4 sm:block">
                    {index + 1}
                  </span>

                  <Field label={index === 0 ? 'Product' : ''} htmlFor={`variant-${line.key}`}>
                    <Combobox
                      id={`variant-${line.key}`}
                      options={variantOptions}
                      value={line.bundleId ? `bundle:${line.bundleId}` : line.variantId}
                      onChange={(value) => {
                        if (value?.startsWith('bundle:')) {
                          const pickedBundle = bundleById.get(value.slice(7));
                          const first = pickedBundle?.components[0];
                          if (!pickedBundle || !first) return;
                          setLines((current) =>
                            current.map((candidate) =>
                              candidate.key === line.key
                                ? {
                                    ...candidate,
                                    bundleId: pickedBundle.id,
                                    variantId: first.variantId,
                                    unitPrice: toDecimalString(
                                      currency === 'SRD'
                                        ? fromBase(pickedBundle.priceCents, rateMicros)
                                        : pickedBundle.priceCents,
                                    ),
                                  }
                                : candidate,
                            ),
                          );
                          return;
                        }
                        const picked = value ? byId.get(value) : undefined;
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? {
                                  ...candidate,
                                  variantId: value,
                                  bundleId: null,
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
                      placeholder="Choose a product or bundle"
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

                  <div className={index === 0 ? 'pt-0.5' : ''}>
                    <span className="hidden self-center tabular text-right text-[13px] text-ink-2 sm:block">
                      {line.variantId && lineTotal > 0 ? toDecimalString(lineTotal) : '—'}
                    </span>
                  </div>

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

                  {line.variantId ? (
                    <Field
                      label="Serial numbers"
                      htmlFor={`serials-${line.key}`}
                      hint={`Optional — one per line, up to ${quantity || 1} for this line`}
                      className="sm:col-span-6"
                    >
                      <Textarea
                        id={`serials-${line.key}`}
                        rows={2}
                        spellCheck={false}
                        placeholder="e.g. SN-48213-X"
                        value={line.serials}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((candidate) =>
                              candidate.key === line.key
                                ? { ...candidate, serials: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </Field>
                  ) : null}

                  {oversold ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-warning sm:col-span-6">
                      <AlertTriangle className="size-3" />
                      {bundle
                        ? `Only ${bundle.availability} complete bundle${bundle.availability === 1 ? '' : 's'} available. The sale will still record, and component shortfalls will be flagged.`
                        : `Only ${Math.max(variant?.onHand ?? 0, 0)} on hand. The sale will still record, and the shortfall will be flagged.`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-line-subtle border-t px-4 py-2.5">
            <button
              type="button"
              onClick={() => setLines((current) => [...current, newLine()])}
              className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line py-2 text-[12px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
            >
              <Plus className="size-3.5" /> Add another product
            </button>
            <span className="hidden shrink-0 pl-4 tabular text-[11px] text-ink-4 sm:block">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {totals.units}{' '}
              {totals.units === 1 ? 'unit' : 'units'}
            </span>
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader title="Discount" hint="Applied to the whole sale, not a single item" />
          <div className="grid gap-3 p-4 sm:grid-cols-[160px_1fr]">
            <Field label={`Amount (${currency})`} htmlFor="discount">
              <Input
                id="discount"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </Field>
            <Field
              label="Reason"
              htmlFor="discountReason"
              hint="Optional — rounded down, bundle…"
            >
              <Input
                id="discountReason"
                placeholder="Why the price came down"
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
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
          <Row label="Subtotal" value={formatMoney(totals.gross)} />
          {totals.discount > 0 ? (
            <Row label="Discount" value={`−${formatMoney(totals.discount)}`} muted />
          ) : null}
          <Row label="Revenue" value={formatMoney(totals.revenue)} />
          <Row label="Cost of goods" value={formatMoney(totals.cogs)} muted />
          <div className="border-line-subtle border-t pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-ink-2">Gross profit</dt>
              <dd>
                <Money cents={totals.profit} tone="flow" size="lg" />
              </dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-ink-4">Margin</dt>
              <dd>
                <Percent
                  value={totals.revenue === 0 ? 0 : totals.profit / totals.revenue}
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

        <div className="border-line-subtle border-t p-4">
          <fieldset disabled={isPending}>
            <legend className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
              Payment when confirmed
            </legend>
            <div className="mt-2 space-y-1.5">
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-control border p-2.5 text-[12px] transition-colors has-[:checked]:border-accent-border has-[:checked]:bg-accent-muted/40',
                  paidInFull ? 'border-accent-border bg-accent-muted/40' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="sale-payment-timing"
                  checked={paidInFull}
                  onChange={() => setPaidInFull(true)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-ink">Paid in full now</span>
                  <span className="block text-ink-4">
                    Posts one receipt for {formatMoney(nativeTotal, currency)} to the cash
                    ledger.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-control border p-2.5 text-[12px] transition-colors',
                  !paidInFull ? 'border-accent-border bg-accent-muted/40' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="sale-payment-timing"
                  checked={!paidInFull}
                  onChange={() => setPaidInFull(false)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-ink">Money comes later</span>
                  <span className="block text-ink-4">
                    The sale is confirmed on credit and tracked until it is settled.
                  </span>
                </span>
              </label>
            </div>
            {!paidInFull ? (
              <div className="mt-2">
                <Field
                  label={`Deposit now (${currency})`}
                  htmlFor="deposit-now"
                  hint={`Balance ${formatMoney(Math.max(0, nativeTotal - depositCents), currency)} goes on credit`}
                >
                  <Input
                    id="deposit-now"
                    numeric
                    inputMode="decimal"
                    placeholder="0.00"
                    value={deposit}
                    onChange={(event) => setDeposit(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </fieldset>
        </div>

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
