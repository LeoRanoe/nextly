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
import { createCategory, createSupplier } from '@/server/actions/reference';
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
};

export type ProductFormValues = {
  id?: string;
  code: string;
  name: string;
  slug: string;
  categoryId: string | null;
  supplierId: string | null;
  sourceUrl: string;
  summary: string;
  description: string;
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
  sourceUrl: '',
  summary: '',
  description: '',
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

export function ProductForm({
  initial,
  categories,
  suppliers,
}: {
  /** Omit to render a blank form. */
  initial?: ProductFormValues;
  categories: Option[];
  suppliers: Option[];
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const [values, setValues] = useState<ProductFormValues>(() => initial ?? emptyProduct());
  const [categoryList, setCategoryList] = useState(categories);
  const [supplierList, setSupplierList] = useState(suppliers);
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
          sourceUrl: values.sourceUrl || '',
          summary: values.summary || undefined,
          description: values.description || undefined,
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
