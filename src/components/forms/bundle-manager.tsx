'use client';

import { Archive, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Money, Percent } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import {
  archiveBundle,
  createBundle,
  recalculateBundlePrice,
  updateBundle,
} from '@/server/actions/bundles';
import type { BundleOption, VariantOption } from '@/server/queries/pickers';

type DraftComponent = { key: string; variantId: string; quantity: string };

const newComponent = (): DraftComponent => ({
  key: crypto.randomUUID(),
  variantId: '',
  quantity: '1',
});

const blank = () => ({
  sku: '',
  name: '',
  description: '',
  price: '',
  components: [newComponent()],
});

export function BundleManager({
  bundles,
  variants,
}: {
  bundles: BundleOption[];
  variants: VariantOption[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(blank);
  const [pricing, setPricing] = useState<{
    landedCostCents: number;
    minimumSafePriceCents: number;
    recommendedPriceCents: number;
    grossProfitCents: number;
    margin: number;
    savingsCents: number;
  } | null>(null);
  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const options: ComboboxOption[] = variants.map((variant) => ({
    value: variant.id,
    label: `${variant.productName} · ${variant.variantName}`,
    hint: variant.sku,
  }));

  const save = useAction(editingId ? updateBundle : createBundle, {
    onSuccess: () => {
      toast.success(editingId ? 'Bundle updated' : 'Bundle created');
      setEditingId(null);
      setDraft(blank());
      setPricing(null);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save the bundle'),
  });
  const archive = useAction(archiveBundle, {
    onSuccess: () => {
      toast.success('Bundle archived');
      setEditingId(null);
      setDraft(blank());
      setPricing(null);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not archive the bundle'),
  });
  const price = useAction(recalculateBundlePrice, {
    onSuccess: ({ data }) => {
      if (data) {
        setPricing(data);
        setDraft((current) => ({
          ...current,
          price: toDecimalString(data.recommendedPriceCents),
        }));
      }
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not calculate bundle price'),
  });

  function edit(bundle: BundleOption) {
    setEditingId(bundle.id);
    setDraft({
      sku: bundle.sku,
      name: bundle.name,
      description: bundle.description ?? '',
      price: toDecimalString(bundle.priceCents),
      components: bundle.components.map((component) => ({
        key: crypto.randomUUID(),
        variantId: component.variantId,
        quantity: String(component.quantity),
      })),
    });
    setPricing(null);
  }
  function submit() {
    const components = draft.components
      .filter((component) => component.variantId)
      .map((component) => ({ variantId: component.variantId, quantity: component.quantity }));
    if (!draft.sku || !draft.name || components.length === 0) {
      toast.error('Add a name, SKU and at least one component');
      return;
    }
    const input = {
      sku: draft.sku,
      name: draft.name,
      description: draft.description || undefined,
      priceCents: draft.price || '0',
      components,
    };
    (save.execute as (value: typeof input & { id?: string }) => void)({
      ...input,
      ...(editingId ? { id: editingId } : {}),
    });
  }
  function calculate() {
    price.execute({
      components: draft.components
        .filter((component) => component.variantId)
        .map((component) => ({
          variantId: component.variantId,
          quantity: Number.parseInt(component.quantity, 10) || 1,
        })),
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface>
        <SurfaceHeader
          title="Bundles"
          hint="Component stock is consumed when the bundle sells"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setDraft(blank());
                setPricing(null);
              }}
            >
              <Plus className="size-4" /> New bundle
            </Button>
          }
        />
        <div className="divide-y divide-line-subtle">
          {bundles.map((bundle) => (
            <div key={bundle.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{bundle.name}</p>
                <p className="text-[11px] text-ink-4">
                  {bundle.sku} · {bundle.availability} available ·{' '}
                  <Money cents={bundle.priceCents} size="sm" />
                </p>
                <p className="mt-1 text-[11px] text-ink-3">
                  {bundle.components
                    .map((component) => `${component.quantity}× ${component.variantName}`)
                    .join(' · ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${bundle.name}`}
                onClick={() => edit(bundle)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          ))}
          {bundles.length === 0 ? (
            <p className="p-8 text-center text-[13px] text-ink-3">
              No bundles yet. Create one from the components you sell together.
            </p>
          ) : null}
        </div>
      </Surface>
      <Surface>
        <SurfaceHeader
          title={editingId ? 'Edit bundle' : 'New bundle'}
          hint="Price is customer-facing; cost is always component weighted average"
        />
        <div className="space-y-3 p-4">
          <Field label="Name" htmlFor="bundle-name" required>
            <Input
              id="bundle-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Camera starter kit"
            />
          </Field>
          <Field label="SKU" htmlFor="bundle-sku" required>
            <Input
              id="bundle-sku"
              value={draft.sku}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sku: event.target.value }))
              }
              placeholder="BND-CAMERA-KIT"
            />
          </Field>
          <Field label="Description" htmlFor="bundle-description">
            <Textarea
              id="bundle-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={2}
              placeholder="What the customer gets"
            />
          </Field>
          <div className="space-y-2">
            <p className="text-[11px] text-ink-4 uppercase tracking-[.06em]">Components</p>
            {draft.components.map((component, index) => (
              <div
                className="grid grid-cols-[1fr_64px_28px] items-end gap-2"
                key={component.key}
              >
                <Field
                  label={index === 0 ? 'Product' : ''}
                  htmlFor={`bundle-component-${index}`}
                >
                  <Combobox
                    id={`bundle-component-${index}`}
                    options={options}
                    value={component.variantId || null}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        components: current.components.map((entry, i) =>
                          i === index ? { ...entry, variantId: value ?? '' } : entry,
                        ),
                      }))
                    }
                    placeholder="Choose component"
                    searchPlaceholder="Search SKU or name"
                  />
                </Field>
                <Field label={index === 0 ? 'Qty' : ''} htmlFor={`bundle-quantity-${index}`}>
                  <Input
                    id={`bundle-quantity-${index}`}
                    numeric
                    inputMode="numeric"
                    value={component.quantity}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        components: current.components.map((entry, i) =>
                          i === index ? { ...entry, quantity: event.target.value } : entry,
                        ),
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove component"
                  disabled={draft.components.length === 1}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      components: current.components.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  components: [...current.components, newComponent()],
                }))
              }
            >
              <Plus className="size-3.5" /> Add component
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Bundle price (USD)" htmlFor="bundle-price" required>
              <Input
                id="bundle-price"
                numeric
                inputMode="decimal"
                value={draft.price}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="0.00"
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={calculate}
              disabled={price.status === 'executing'}
            >
              Calculate price
            </Button>
          </div>
          {draft.components.some((component) => component.variantId) ? (
            <BundlePreview draft={draft} pricing={pricing} variantById={variantById} />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-line-subtle border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setDraft(blank());
                setPricing(null);
              }}
            >
              Clear
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => archive.execute({ id: editingId })}
                disabled={archive.status === 'executing'}
              >
                <Archive className="size-4" /> Archive
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              onClick={submit}
              disabled={save.status === 'executing'}
            >
              <Save className="size-4" /> Save bundle
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function BundlePreview({
  draft,
  pricing,
  variantById,
}: {
  draft: { components: DraftComponent[]; price: string };
  pricing: {
    landedCostCents: number;
    minimumSafePriceCents: number;
    recommendedPriceCents: number;
    grossProfitCents: number;
    margin: number;
    savingsCents: number;
  } | null;
  variantById: Map<string, VariantOption>;
}) {
  let retail = 0;
  for (const component of draft.components) {
    const variant = variantById.get(component.variantId);
    retail += (Number.parseInt(component.quantity, 10) || 0) * (variant?.listPriceCents ?? 0);
  }
  let price = 0;
  try {
    price = parseMoney(draft.price || '0');
  } catch {
    price = 0;
  }
  return (
    <div className="rounded-control border border-line-subtle bg-sunken p-3 text-[12px]">
      <div className="flex justify-between text-ink-2">
        <span>Component retail total</span>
        <span className="tabular">{formatMoney(retail)}</span>
      </div>
      <div className="mt-1 flex justify-between text-ink-2">
        <span>Customer savings</span>
        <span className="tabular">{formatMoney(Math.max(0, retail - price))}</span>
      </div>
      <div className="mt-2 flex justify-between font-medium text-ink">
        <span>Current price</span>
        <span className="tabular">{formatMoney(price)}</span>
      </div>
      {pricing ? (
        <>
          <div className="mt-2 flex justify-between text-ink-2">
            <span>Component landed cost</span>
            <span className="tabular">{formatMoney(pricing.landedCostCents)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Minimum safe price</span>
            <span className="tabular">{formatMoney(pricing.minimumSafePriceCents)}</span>
          </div>
          <div className="flex justify-between text-ink-2">
            <span>Recommended price</span>
            <span className="tabular">{formatMoney(pricing.recommendedPriceCents)}</span>
          </div>
          {price < pricing.minimumSafePriceCents ? (
            <p className="mt-2 rounded-control bg-warning-muted px-2 py-1.5 text-[11px] text-warning">
              Warning: this price is below the minimum safe price and misses the target margin.
            </p>
          ) : null}
        </>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-4">
        <Percent value={retail ? (retail - price) / retail : 0} tone="muted" /> discount from
        component retail
      </div>
    </div>
  );
}
