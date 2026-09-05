'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { createProduct, updateProduct } from '@/server/actions/products';
import { createBrand, createCategory, createSupplier } from '@/server/actions/reference';
import type { Option } from '@/server/queries/pickers';

/**
 * Creating and editing a product.
 *
 * A product always has at least one variant, even when it has no real options,
 * because the variant is what carries stock, cost and price. Modelling it any
 * other way is what led the spreadsheet to list the same camera twice.
 */

type VariantRow = {
  key: string;
  id?: string;
  name: string;
  sku: string;
  listPrice: string;
  referenceCost: string;
  weightGrams: string;
  isStrategic: boolean;
  isActive: boolean;
  barcode: string;
  attributes: { key: string; value: string }[];
};

export type ProductFormValues = {
  id?: string;
  code: string;
  name: string;
  slug: string;
  categoryId: string | null;
  supplierId: string | null;
  brandId: string | null;
  sourceUrl: string;
  summary: string;
  description: string;
  specs: { key: string; value: string }[];
  modelNumber: string;
  keyFeatures: string;
  bestFor: string;
  platforms: string;
  protocols: string;
  ecosystems: string;
  boxContents: string;
  nextlyTake: string;
  hubRequired: boolean;
  hubName: string;
  appRequired: boolean;
  appName: string;
  wifiRequired: boolean;
  wifiBands: string;
  indoorOutdoor: '' | 'indoor' | 'outdoor' | 'indoor-outdoor';
  powerSource: string;
  installationNotes: string;
  faqItems: { question: string; answer: string }[];
  featured: boolean;
  featuredPosition: string;
  newUntil: string;
  showWhenOutOfStock: boolean;
  restockNotificationsEnabled: boolean;
  status: 'draft' | 'active' | 'archived';
  /** F-6: months of warranty from the day of sale; '0' means none. */
  warrantyMonths: string;
  catalogPublished: boolean;
  notes: string;
  variants: VariantRow[];
};

const blankVariant = (): VariantRow => ({
  key: crypto.randomUUID(),
  name: '',
  sku: '',
  listPrice: '',
  referenceCost: '',
  weightGrams: '0',
  isStrategic: false,
  isActive: true,
  barcode: '',
  attributes: [],
});

/** The blank form. Not exported: it constructs client-only state (a random
 *  key per variant), and calling it from a Server Component is a runtime
 *  error rather than something the types would catch. */
const emptyProduct = (): ProductFormValues => ({
  code: '',
  name: '',
  slug: '',
  categoryId: null,
  supplierId: null,
  brandId: null,
  sourceUrl: '', specs: [],
  summary: '',
  description: '',
  modelNumber: '', keyFeatures: '', bestFor: '', platforms: '', protocols: '', ecosystems: '', boxContents: '', nextlyTake: '', hubRequired: false, hubName: '', appRequired: false, appName: '', wifiRequired: false, wifiBands: '', indoorOutdoor: '', powerSource: '', installationNotes: '', faqItems: [], featured: false, featuredPosition: '', newUntil: '', showWhenOutOfStock: true, restockNotificationsEnabled: false,
  status: 'active',
  warrantyMonths: '0',
  catalogPublished: false,
  notes: '',
  variants: [{ ...blankVariant(), name: 'Standard' }],
});

/** Lowercase, hyphenated, no punctuation. Suggested, never forced: the slug is
 *  a public URL and someone may want to choose it. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      // \p{Diacritic} rather than a literal combining-mark range: the range is
      // invisible in an editor and does not survive an encoding change intact.
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

function toLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function ProductForm({
  initial,
  categories,
  suppliers,
  brands,
}: {
  /** Omit to render a blank form. */
  initial?: ProductFormValues;
  categories: Option[];
  suppliers: Option[];
  brands: Option[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const [values, setValues] = useState<ProductFormValues>(() => initial ?? emptyProduct());
  const [categoryList, setCategoryList] = useState(categories);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [brandList, setBrandList] = useState(brands);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const setVariant = (key: string, patch: Partial<VariantRow>) =>
    setValues((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant,
      ),
    }));

  const action = isEdit ? updateProduct : createProduct;

  const { execute, isPending } = useAction(action, {
    onSuccess({ data }) {
      toast.success(isEdit ? `${data?.name} updated` : `${data?.name} created`);
      router.push('/products');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not save the product', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });

  const createInlineCategory = useAction(createCategory, {
    onSuccess({ data }) {
      if (!data) return;
      setCategoryList((current) => [...current, { id: data.id, label: data.name }]);
      set('categoryId', data.id);
    },
    onError: () => toast.error('Could not add that category'),
  });

  const createInlineSupplier = useAction(createSupplier, {
    onSuccess({ data }) {
      if (!data) return;
      setSupplierList((current) => [...current, { id: data.id, label: data.name }]);
      set('supplierId', data.id);
    },
    onError: () => toast.error('Could not add that supplier'),
  });
  const createInlineBrand = useAction(createBrand, { onSuccess({ data }) { if (!data) return; setBrandList((current) => [...current, { id: data.id, label: data.name }]); set('brandId', data.id); }, onError: () => toast.error('Could not add that brand') });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        execute({
          ...(isEdit ? { id: initial?.id as string } : {}),
          code: values.code,
          name: values.name,
          slug: values.slug || slugify(values.name),
          categoryId: values.categoryId,
          supplierId: values.supplierId,
          brandId: values.brandId,
          sourceUrl: values.sourceUrl || '',
          summary: values.summary || undefined,
          description: values.description || undefined,
          specs: Object.fromEntries(values.specs.filter((spec) => spec.key.trim() && spec.value.trim()).map((spec) => [spec.key.trim(), spec.value.trim()])),
          modelNumber: values.modelNumber || undefined,
          keyFeatures: toLines(values.keyFeatures), bestFor: toLines(values.bestFor),
          compatibility: { platforms: toLines(values.platforms), protocols: toLines(values.protocols), ecosystems: toLines(values.ecosystems) },
          boxContents: toLines(values.boxContents), nextlyTake: values.nextlyTake || undefined,
          buyerRequirements: { hubRequired: values.hubRequired || undefined, hubName: values.hubName || undefined, appRequired: values.appRequired || undefined, appName: values.appName || undefined, wifiRequired: values.wifiRequired || undefined, wifiBands: toLines(values.wifiBands), indoorOutdoor: values.indoorOutdoor || undefined, powerSource: values.powerSource || undefined, installationNotes: values.installationNotes || undefined },
          faqItems: values.faqItems.filter((item) => item.question.trim() && item.answer.trim()),
          featured: values.featured, featuredPosition: values.featuredPosition || undefined, newUntil: values.newUntil || undefined, showWhenOutOfStock: values.showWhenOutOfStock, restockNotificationsEnabled: values.restockNotificationsEnabled,
          status: values.status,
          warrantyMonths: values.warrantyMonths || '0',
          catalogPublished: values.catalogPublished,
          notes: values.notes || undefined,
          variants: values.variants.map((variant) => ({
            ...(variant.id ? { id: variant.id } : {}),
            name: variant.name,
            sku: variant.sku,
            listPriceCents: variant.listPrice || '0',
            referenceCostCents: variant.referenceCost || '0',
            weightGrams: Number(variant.weightGrams || 0),
            isStrategic: variant.isStrategic,
            isActive: variant.isActive,
            barcode: variant.barcode || undefined,
            attributes: Object.fromEntries(variant.attributes.filter((attribute) => attribute.key.trim() && attribute.value.trim()).map((attribute) => [attribute.key.trim(), attribute.value.trim()])),
          })),
        } as Parameters<typeof execute>[0]);
      }}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start"
    >
      <div className="space-y-4">
        <Surface>
          <SurfaceHeader title="Product" />
          <div className="space-y-3 p-4">
            <Field label="Name" htmlFor="name" required>
              <Input
                id="name"
                value={values.name}
                required
                placeholder="Wyze Cam Pan V3"
                onChange={(event) => {
                  const name = event.target.value;
                  setValues((current) => ({
                    ...current,
                    name,
                    slug: slugTouched ? current.slug : slugify(name),
                  }));
                }}
              />
            </Field>

            <FieldRow>
              <Field label="Code" htmlFor="code" hint="Internal handle" required>
                <Input
                  id="code"
                  value={values.code}
                  required
                  placeholder="NX-WYZE-PANV3"
                  className="tabular"
                  onChange={(event) => set('code', event.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Slug" htmlFor="slug" hint="Public catalog URL" required>
                <Input
                  id="slug"
                  value={values.slug}
                  required
                  placeholder="wyze-cam-pan-v3"
                  className="tabular"
                  onChange={(event) => {
                    setSlugTouched(true);
                    set('slug', slugify(event.target.value));
                  }}
                />
              </Field>
            </FieldRow>
            <Field label="Brand" htmlFor="brand" hint="Actual manufacturer, not supplier">
              <Combobox id="brand" options={brandList.map((brand) => ({ value: brand.id, label: brand.label }))} value={values.brandId} onChange={(value) => set('brandId', value)} placeholder="No brand" createLabel="Add brand" onCreate={(name) => createInlineBrand.execute({ name, slug: slugify(name), active: true })} />
            </Field>

            <FieldRow>
              <Field label="Category" htmlFor="category">
                <Combobox
                  id="category"
                  options={categoryList.map((c) => ({ value: c.id, label: c.label }))}
                  value={values.categoryId}
                  onChange={(value) => set('categoryId', value)}
                  placeholder="Uncategorised"
                  createLabel="Add category"
                  onCreate={(name) =>
                    createInlineCategory.execute({ name, slug: slugify(name) })
                  }
                />
              </Field>
              <Field label="Supplier" htmlFor="supplier">
                <Combobox
                  id="supplier"
                  options={supplierList.map((s) => ({ value: s.id, label: s.label }))}
                  value={values.supplierId}
                  onChange={(value) => set('supplierId', value)}
                  placeholder="No supplier"
                  createLabel="Add supplier"
                  onCreate={(name) => createInlineSupplier.execute({ name, kind: 'other' })}
                />
              </Field>
            </FieldRow>

            <Field label="Source URL" htmlFor="sourceUrl" hint="Where it is bought">
              <Input
                id="sourceUrl"
                type="url"
                value={values.sourceUrl}
                placeholder="https://www.amazon.com/..."
                onChange={(event) => set('sourceUrl', event.target.value)}
              />
            </Field>
          </div>
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Variants"
            hint="What is actually stocked and sold. One per colour, size or pack."
            action={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    variants: [...current.variants, blankVariant()],
                  }))
                }
              >
                <Plus className="size-3.5" /> Add variant
              </Button>
            }
          />
          <div className="divide-y divide-line-subtle">
            {values.variants.map((variant, index) => (
              <div
                key={variant.key}
                className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_110px_110px_100px_120px_32px]"
              >
                <Field label={index === 0 ? 'Option' : ''} htmlFor={`vname-${variant.key}`}>
                  <Input
                    id={`vname-${variant.key}`}
                    value={variant.name}
                    required
                    placeholder="Black"
                    onChange={(event) => setVariant(variant.key, { name: event.target.value })}
                  />
                </Field>
                <Field label={index === 0 ? 'SKU' : ''} htmlFor={`vsku-${variant.key}`}>
                  <Input
                    id={`vsku-${variant.key}`}
                    value={variant.sku}
                    required
                    className="tabular"
                    placeholder="NX-WYZE-PANV3-BLK"
                    onChange={(event) =>
                      setVariant(variant.key, { sku: event.target.value.toUpperCase() })
                    }
                  />
                </Field>
                <Field
                  label={index === 0 ? 'Sell (USD)' : ''}
                  htmlFor={`vprice-${variant.key}`}
                >
                  <Input
                    id={`vprice-${variant.key}`}
                    numeric
                    inputMode="decimal"
                    placeholder="0.00"
                    value={variant.listPrice}
                    onChange={(event) =>
                      setVariant(variant.key, { listPrice: event.target.value })
                    }
                  />
                </Field>
                <Field label={index === 0 ? 'Barcode' : ''} htmlFor={`vbarcode-${variant.key}`}>
                  <Input id={`vbarcode-${variant.key}`} value={variant.barcode} placeholder="Optional" onChange={(event) => setVariant(variant.key, { barcode: event.target.value })} />
                </Field>
                <Field label={index === 0 ? 'List cost' : ''} htmlFor={`vcost-${variant.key}`}>
                  <Input
                    id={`vcost-${variant.key}`}
                    numeric
                    inputMode="decimal"
                    placeholder="0.00"
                    value={variant.referenceCost}
                    onChange={(event) =>
                      setVariant(variant.key, { referenceCost: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label={index === 0 ? 'Weight (g)' : ''}
                  htmlFor={`vweight-${variant.key}`}
                >
                  <Input
                    id={`vweight-${variant.key}`}
                    numeric
                    inputMode="numeric"
                    placeholder="0"
                    value={variant.weightGrams}
                    onChange={(event) =>
                      setVariant(variant.key, { weightGrams: event.target.value })
                    }
                  />
                </Field>
                <label className="flex items-end gap-2 pb-1 text-[11px] text-ink-3">
                  <input
                    type="checkbox"
                    checked={variant.isStrategic}
                    onChange={(event) =>
                      setVariant(variant.key, { isStrategic: event.target.checked })
                    }
                    className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
                  />
                  Strategic stock
                </label>
                <div className="flex items-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove variant"
                    disabled={values.variants.length === 1}
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        variants: current.variants.filter((v) => v.key !== variant.key),
                      }))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="sm:col-span-3">
                  <p className="mb-1 text-[11px] text-ink-4">Attributes</p>
                  {variant.attributes.map((attribute, attributeIndex) => <div key={`${variant.key}-${attributeIndex}`} className="mb-1 flex gap-1"><Input value={attribute.key} placeholder="colour" onChange={(event) => setVariant(variant.key, { attributes: variant.attributes.map((item, i) => i === attributeIndex ? { ...item, key: event.target.value } : item) })} /><Input value={attribute.value} placeholder="Black" onChange={(event) => setVariant(variant.key, { attributes: variant.attributes.map((item, i) => i === attributeIndex ? { ...item, value: event.target.value } : item) })} /><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove attribute" onClick={() => setVariant(variant.key, { attributes: variant.attributes.filter((_, i) => i !== attributeIndex) })}><Trash2 className="size-3" /></Button></div>)}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVariant(variant.key, { attributes: [...variant.attributes, { key: '', value: '' }] })}>Add attribute</Button>
                </div>
              </div>
            ))}
          </div>
          <p className="border-line-subtle border-t px-4 py-2.5 text-[11px] text-ink-4 leading-relaxed">
            List cost is the supplier&rsquo;s asking price, kept for reference only. Stock is
            always valued at what a purchase order actually paid, freight included.
          </p>
        </Surface>

        <Surface>
          <SurfaceHeader title="Catalog" hint="Used by the public storefront" />
          <div className="space-y-3 p-4">
            <Field label="Summary" htmlFor="summary" hint="One line">
              <Input
                id="summary"
                value={values.summary}
                placeholder="Indoor and outdoor pan-tilt security camera, IP65 rated."
                onChange={(event) => set('summary', event.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </Field>
            <div className="border-t border-line-subtle pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-medium text-ink">Specifications</p><Button type="button" size="sm" variant="ghost" onClick={() => set('specs', [...values.specs, { key: '', value: '' }])}>Add specification</Button></div>{values.specs.map((spec, index) => <div key={index} className="mb-2 flex gap-2"><Input value={spec.key} placeholder="e.g. Resolution" onChange={(event) => set('specs', values.specs.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /><Input value={spec.value} placeholder="e.g. 1080p" onChange={(event) => set('specs', values.specs.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove specification" onClick={() => set('specs', values.specs.filter((_, i) => i !== index))}><Trash2 className="size-3" /></Button></div>)}</div>
            <FieldRow>
              <Field label="Model number" htmlFor="modelNumber"><Input id="modelNumber" value={values.modelNumber} onChange={(event) => set('modelNumber', event.target.value)} /></Field>
              <Field label="Nextly’s take" htmlFor="nextlyTake"><Input id="nextlyTake" value={values.nextlyTake} onChange={(event) => set('nextlyTake', event.target.value)} /></Field>
            </FieldRow>
            <Field label="Key features" htmlFor="keyFeatures" hint="One per line"><Textarea id="keyFeatures" value={values.keyFeatures} onChange={(event) => set('keyFeatures', event.target.value)} /></Field>
            <Field label="Best for" htmlFor="bestFor" hint="One per line"><Textarea id="bestFor" value={values.bestFor} onChange={(event) => set('bestFor', event.target.value)} /></Field>
            <Field label="What’s in the box" htmlFor="boxContents" hint="One item per line"><Textarea id="boxContents" value={values.boxContents} onChange={(event) => set('boxContents', event.target.value)} /></Field>
            <FieldRow>
              <Field label="Platforms" htmlFor="platforms" hint="One per line"><Textarea id="platforms" value={values.platforms} placeholder="Amazon Alexa&#10;Google Home" onChange={(event) => set('platforms', event.target.value)} /></Field>
              <Field label="Protocols" htmlFor="protocols" hint="One per line"><Textarea id="protocols" value={values.protocols} placeholder="Wi-Fi&#10;Matter" onChange={(event) => set('protocols', event.target.value)} /></Field>
            </FieldRow>
            <Field label="Ecosystems" htmlFor="ecosystems" hint="One per line"><Textarea id="ecosystems" value={values.ecosystems} placeholder="Home Assistant" onChange={(event) => set('ecosystems', event.target.value)} /></Field>
            <div className="border-t border-line-subtle pt-3"><p className="mb-2 text-[13px] font-medium text-ink">Before you buy</p><div className="flex flex-wrap gap-4 text-[12px] text-ink-2"><label className="flex items-center gap-2"><input type="checkbox" checked={values.hubRequired} onChange={(event) => set('hubRequired', event.target.checked)} /> Hub required</label><label className="flex items-center gap-2"><input type="checkbox" checked={values.appRequired} onChange={(event) => set('appRequired', event.target.checked)} /> App required</label><label className="flex items-center gap-2"><input type="checkbox" checked={values.wifiRequired} onChange={(event) => set('wifiRequired', event.target.checked)} /> Wi-Fi required</label></div><FieldRow><Field label="Hub name" htmlFor="hubName"><Input id="hubName" value={values.hubName} onChange={(event) => set('hubName', event.target.value)} /></Field><Field label="App name" htmlFor="appName"><Input id="appName" value={values.appName} onChange={(event) => set('appName', event.target.value)} /></Field></FieldRow><FieldRow><Field label="Wi-Fi bands" htmlFor="wifiBands" hint="One per line"><Input id="wifiBands" value={values.wifiBands} onChange={(event) => set('wifiBands', event.target.value)} /></Field><Field label="Power" htmlFor="powerSource"><Input id="powerSource" value={values.powerSource} onChange={(event) => set('powerSource', event.target.value)} /></Field></FieldRow><Field label="Use" htmlFor="indoorOutdoor"><Select id="indoorOutdoor" value={values.indoorOutdoor} onChange={(event) => set('indoorOutdoor', event.target.value as ProductFormValues['indoorOutdoor'])}><option value="">Not specified</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="indoor-outdoor">Indoor & outdoor</option></Select></Field><Field label="Installation notes" htmlFor="installationNotes"><Textarea id="installationNotes" value={values.installationNotes} onChange={(event) => set('installationNotes', event.target.value)} /></Field></div>
            <div className="border-t border-line-subtle pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-medium text-ink">Frequently asked questions</p><Button type="button" size="sm" variant="ghost" onClick={() => set('faqItems', [...values.faqItems, { question: '', answer: '' }])}>Add FAQ</Button></div>{values.faqItems.map((item, index) => <div key={index} className="mb-2 flex gap-2"><Input value={item.question} placeholder="Question" onChange={(event) => set('faqItems', values.faqItems.map((current, i) => i === index ? { ...current, question: event.target.value } : current))} /><Input value={item.answer} placeholder="Answer" onChange={(event) => set('faqItems', values.faqItems.map((current, i) => i === index ? { ...current, answer: event.target.value } : current))} /><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove FAQ" onClick={() => set('faqItems', values.faqItems.filter((_, i) => i !== index))}><Trash2 className="size-3" /></Button></div>)}</div>
            <div className="flex flex-wrap gap-4 text-[12px] text-ink-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={values.featured} onChange={(event) => set('featured', event.target.checked)} /> Featured product</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={values.showWhenOutOfStock} onChange={(event) => set('showWhenOutOfStock', event.target.checked)} /> Show when sold out</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={values.restockNotificationsEnabled} onChange={(event) => set('restockNotificationsEnabled', event.target.checked)} /> Enable restock notification</label>
            </div>
            <FieldRow><Field label="Featured position" htmlFor="featuredPosition" hint="Lower appears first"><Input id="featuredPosition" numeric inputMode="numeric" value={values.featuredPosition} onChange={(event) => set('featuredPosition', event.target.value)} /></Field><Field label="New until" htmlFor="newUntil"><Input id="newUntil" type="date" value={values.newUntil} onChange={(event) => set('newUntil', event.target.value)} /></Field></FieldRow>
            <Field label="Internal notes" htmlFor="notes" hint="Never shown publicly">
              <Textarea
                id="notes"
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </div>
        </Surface>
      </div>

      <Surface className="xl:sticky xl:top-20">
        <SurfaceHeader title="Publishing" />
        <div className="space-y-3 p-4">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={values.status}
              onChange={(event) =>
                set('status', event.target.value as ProductFormValues['status'])
              }
            >
              <option value="draft">Draft — not yet in use</option>
              <option value="active">Active — buy and sell it</option>
              <option value="archived">Archived — keep history, stop using</option>
            </Select>
          </Field>

          <Field
            label="Warranty (months)"
            htmlFor="warrantyMonths"
            hint="0 = none. Expiry counts from the day of sale."
          >
            <Input
              id="warrantyMonths"
              numeric
              inputMode="numeric"
              placeholder="0"
              value={values.warrantyMonths}
              onChange={(event) => set('warrantyMonths', event.target.value)}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3">
            <input
              type="checkbox"
              checked={values.catalogPublished}
              onChange={(event) => set('catalogPublished', event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
            />
            <span>
              <span className="block text-[13px] text-ink">Show on the catalog</span>
              <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                The public storefront reads these same rows. Nothing appears there until this is
                on.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2 border-line-subtle border-t p-4">
          <SubmitButton pending={isPending} size="lg" className="w-full">
            {isEdit ? 'Save changes' : 'Create product'}
          </SubmitButton>
          {isEdit ? (
            <p className="text-[11px] text-ink-4 leading-relaxed">
              A variant you remove is deactivated rather than deleted if it has ever moved
              stock, so past sales keep their history.
            </p>
          ) : null}
        </div>
      </Surface>
    </form>
  );
}
