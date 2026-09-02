'use client';

import { PackageCheck, Plus, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMoney } from '@/lib/money';
import { createFxRate, updateSettings } from '@/server/actions/finance';
import { adjustStock } from '@/server/actions/products';
import { receivePurchaseOrder } from '@/server/actions/purchase-orders';

const today = () => new Date().toISOString().slice(0, 10);

/* ── Exchange rate ───────────────────────────────────────────────────────── */

export function RateSheet({ currentRate }: { currentRate: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [note, setNote] = useState('');

  const { execute, isPending } = useAction(createFxRate, {
    onSuccess() {
      toast.success('Exchange rate updated', {
        description: 'Transactions recorded from now on use it. Past ones keep theirs.',
      });
      setOpen(false);
      setRate('');
      setNote('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not set the rate');
    },
  });

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New rate
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Set the exchange rate"
        description="This adds a new dated rate rather than editing the old one. Every past transaction keeps the rate it was recorded with, so no historical report can move."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="rate-form" pending={isPending}>
              Set rate
            </SubmitButton>
          </>
        }
      >
        <form
          id="rate-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({ rate, effectiveFrom, note: note || undefined });
          }}
        >
          <SheetSection title="Rate">
            <Field
              label="SRD per USD"
              htmlFor="rate"
              hint={
                currentRate
                  ? `Currently ${(currentRate / 1_000_000).toFixed(4)}`
                  : 'None set yet'
              }
              required
            >
              <Input
                id="rate"
                numeric
                inputMode="decimal"
                placeholder="38.5"
                value={rate}
                required
                onChange={(event) => setRate(event.target.value)}
              />
            </Field>
            <Field label="Effective from" htmlFor="effectiveFrom" required>
              <Input
                id="effectiveFrom"
                type="date"
                value={effectiveFrom}
                required
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>
            <Field label="Note" htmlFor="note" hint="Where the rate came from">
              <Textarea
                id="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

/* ── Business settings ───────────────────────────────────────────────────── */

export type SettingsInitial = {
  businessName: string;
  displayCurrency: string;
  lowStockThreshold: number;
  legalName: string;
  addressLine: string;
  city: string;
  phone: string;
  whatsapp: string;
  email: string;
  taxId: string;
  logoUrl: string;
  invoiceFooter: string;
  instagram: string;
  openingHours: string;
};

export function SettingsSheet({ initial }: { initial: SettingsInitial }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [displayCurrency, setDisplayCurrency] = useState(initial.displayCurrency);
  const [lowStockThreshold, setLowStockThreshold] = useState(String(initial.lowStockThreshold));
  const [legalName, setLegalName] = useState(initial.legalName);
  const [addressLine, setAddressLine] = useState(initial.addressLine);
  const [city, setCity] = useState(initial.city);
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [email, setEmail] = useState(initial.email);
  const [taxId, setTaxId] = useState(initial.taxId);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [invoiceFooter, setInvoiceFooter] = useState(initial.invoiceFooter);
  const [instagram, setInstagram] = useState(initial.instagram);
  const [openingHours, setOpeningHours] = useState(initial.openingHours);

  const { execute, isPending } = useAction(updateSettings, {
    onSuccess() {
      toast.success('Settings saved');
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not save settings');
    },
  });

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 className="size-3.5" /> Edit
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Business settings"
        description="The books are always kept in USD. The display currency is what SRD amounts are shown alongside."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="settings-form" pending={isPending}>
              Save
            </SubmitButton>
          </>
        }
      >
        <form
          id="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              businessName,
              displayCurrency: displayCurrency as 'SRD',
              lowStockThreshold: Number(lowStockThreshold),
              legalName: legalName || undefined,
              addressLine: addressLine || undefined,
              city: city || undefined,
              phone: phone || undefined,
              whatsapp: whatsapp || undefined,
              email: email || undefined,
              taxId: taxId || undefined,
              logoUrl: logoUrl || undefined,
              invoiceFooter: invoiceFooter || undefined,
              instagram: instagram || undefined,
              openingHours: openingHours || undefined,
            });
          }}
        >
          <SheetSection title="Business">
            <Field label="Name" htmlFor="businessName" required>
              <Input
                id="businessName"
                value={businessName}
                required
                onChange={(event) => setBusinessName(event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field label="Display currency" htmlFor="displayCurrency">
                <Select
                  id="displayCurrency"
                  value={displayCurrency}
                  onChange={(event) => setDisplayCurrency(event.target.value)}
                >
                  <option value="SRD">SRD</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
              <Field label="Low stock at" htmlFor="lowStockThreshold" hint="Units or fewer">
                <Input
                  id="lowStockThreshold"
                  numeric
                  inputMode="numeric"
                  value={lowStockThreshold}
                  onChange={(event) => setLowStockThreshold(event.target.value)}
                />
              </Field>
            </FieldRow>
          </SheetSection>

          <SheetSection
            title="On the invoice"
            hint="Printed with every receipt — fill in what applies"
          >
            <Field
              label="Legal name"
              htmlFor="legalName"
              hint="If different from the trading name"
            >
              <Input
                id="legalName"
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
              />
            </Field>
            <Field label="Address" htmlFor="addressLine">
              <Input
                id="addressLine"
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field label="City" htmlFor="city">
                <Input
                  id="city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </Field>
              <Field label="Tax / BTW number" htmlFor="taxId">
                <Input
                  id="taxId"
                  value={taxId}
                  onChange={(event) => setTaxId(event.target.value)}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Phone" htmlFor="phone">
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field label="WhatsApp" htmlFor="whatsapp" hint="Click-to-chat number">
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                />
              </Field>
            </FieldRow>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field
              label="Logo URL"
              htmlFor="logoUrl"
              hint="Optional — shown top-left of the invoice"
            >
              <Input
                id="logoUrl"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
              />
            </Field>
            <Field
              label="Invoice footer"
              htmlFor="invoiceFooter"
              hint="Warranty terms, thank-you, anything"
            >
              <Textarea
                id="invoiceFooter"
                value={invoiceFooter}
                onChange={(event) => setInvoiceFooter(event.target.value)}
              />
            </Field>
          </SheetSection>

          <SheetSection title="On the website" hint="Shown in the storefront footer">
            <Field label="Opening hours" htmlFor="openingHours" hint="e.g. Mon–Sat 09:00–18:00">
              <Input
                id="openingHours"
                value={openingHours}
                onChange={(event) => setOpeningHours(event.target.value)}
              />
            </Field>
            <Field label="Instagram" htmlFor="instagram" hint="Handle or full URL">
              <Input
                id="instagram"
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

/* ── Receiving ───────────────────────────────────────────────────────────── */

/**
 * The receive dialog.
 *
 * It states plainly what pressing the button will do, because this is the one
 * action in the system that changes stock valuation, and someone should never
 * have to guess whether it also posted the payment.
 */
export function ReceiveOrderSheet({
  orderId,
  orderNumber,
  overheadCents,
  goodsCents,
  unitCount,
}: {
  orderId: string;
  orderNumber: string;
  overheadCents: number;
  goodsCents: number;
  unitCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receivedAt, setReceivedAt] = useState(today());
  const [postPayment, setPostPayment] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('card');

  const { execute, isPending } = useAction(receivePurchaseOrder, {
    onSuccess({ data }) {
      toast.success(`${data?.number} received`, {
        description: data
          ? `${data.unitCount} units at ${formatMoney(data.landedTotalCents)} landed, including ${formatMoney(data.overheadCents)} of freight and fees.`
          : undefined,
      });
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not receive the order');
    },
  });

  const total = goodsCents + overheadCents;
  const perUnit = unitCount > 0 ? total / unitCount / 100 : null;

  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        <PackageCheck className="size-3.5" /> Receive
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Receive ${orderNumber}`}
        description="This allocates freight and fees across the lines, brings the stock in at landed cost, and posts the payment. It is the moment the cost basis is fixed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="receive-form" pending={isPending}>
              Receive order
            </SubmitButton>
          </>
        }
      >
        <form
          id="receive-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              id: orderId,
              receivedAt,
              postPayment,
              paymentMethod: paymentMethod as 'card',
            });
          }}
        >
          <SheetSection title="What this will book">
            <dl className="space-y-2 rounded-card border border-line-subtle bg-inset p-3">
              <Line label="Goods" value={formatMoney(goodsCents)} />
              <Line label="Freight, tax and fees" value={formatMoney(overheadCents)} />
              <div className="flex items-baseline justify-between gap-3 border-line-subtle border-t pt-2">
                <dt className="text-[13px] text-ink-2">Into stock at</dt>
                <dd>
                  <Money cents={total} size="lg" />
                </dd>
              </div>
              {perUnit !== null ? (
                <p className="tabular text-right text-[11px] text-ink-4">
                  {unitCount} units · ${perUnit.toFixed(4)} each
                </p>
              ) : null}
            </dl>
          </SheetSection>

          <SheetSection title="Details">
            <Field label="Received on" htmlFor="receivedAt" required>
              <Input
                id="receivedAt"
                type="date"
                value={receivedAt}
                required
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3">
              <input
                type="checkbox"
                checked={postPayment}
                onChange={(event) => setPostPayment(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
              />
              <span>
                <span className="block text-[13px] text-ink">
                  Post the payment to the cash ledger
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                  Turn off only if this payment is already in the ledger. Posting twice is
                  exactly the drift the Overview will flag.
                </span>
              </span>
            </label>

            {postPayment ? (
              <Field label="Paid by" htmlFor="paymentMethod">
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            ) : null}
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

/* ── Stock adjustment ────────────────────────────────────────────────────── */

export function StockAdjustSheet({
  variantId,
  label,
  onHand,
}: {
  variantId: string;
  label: string;
  onHand: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [kind, setKind] = useState<'adjustment' | 'write_off' | 'return'>('adjustment');
  const [reason, setReason] = useState('');

  const { execute, isPending } = useAction(adjustStock, {
    onSuccess({ data }) {
      toast.success(`${data?.sku} adjusted`, {
        description: `Now ${data?.onHand} on hand.`,
      });
      setOpen(false);
      setQuantity('');
      setReason('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not adjust stock');
    },
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Adjust
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Adjust stock"
        description="Stock on hand is the sum of every movement, so a correction is a new movement rather than an edit. The reason is required, because an unexplained adjustment is what makes an inventory ledger untrustworthy."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="adjust-form" pending={isPending}>
              Record adjustment
            </SubmitButton>
          </>
        }
      >
        <form
          id="adjust-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({ variantId, quantity: Number(quantity), reason, kind });
          }}
        >
          <SheetSection title={label} hint={`${onHand} on hand right now`}>
            <Field label="Kind" htmlFor="kind">
              <Select
                id="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option value="adjustment">Correction — a miscount</option>
                <option value="write_off">Write-off — damaged or lost</option>
                <option value="return">Return — came back from a customer</option>
              </Select>
            </Field>
            <Field label="Change" htmlFor="quantity" hint="Negative to remove units" required>
              <Input
                id="quantity"
                numeric
                inputMode="numeric"
                placeholder="-1"
                value={quantity}
                required
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field label="Reason" htmlFor="reason" required>
              <Textarea
                id="reason"
                value={reason}
                required
                placeholder="Miscounted at the October stocktake"
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="tabular text-[13px] text-ink">{value}</dd>
    </div>
  );
}
