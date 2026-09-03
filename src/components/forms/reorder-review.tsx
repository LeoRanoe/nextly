'use client';

import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import type { ReorderRecommendation } from '@/lib/reorder';
import { createDraftPurchaseOrders } from '@/server/actions/reorder';
import type { Option } from '@/server/queries/pickers';
import type { ReorderSnapshot } from '@/server/queries/reorder';

type SortKey = 'score' | 'profit' | 'velocity' | 'risk' | 'supplier' | 'cost';

const SORT_LABELS: Record<SortKey, string> = {
  score: 'Priority score',
  profit: '90d profit',
  velocity: 'Sales velocity',
  risk: 'Stockout risk',
  supplier: 'Supplier',
  cost: 'Landed cost',
};

function initialQuantities(rows: ReorderRecommendation[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.variantId,
      String(row.budgetQty > 0 ? row.budgetQty : row.recommendedQty),
    ]),
  );
}

function initialSelection(rows: ReorderRecommendation[]) {
  return Object.fromEntries(rows.map((row) => [row.variantId, row.budgetQty > 0]));
}

export function ReorderReview({
  rows,
  suppliers,
  latestSnapshot,
}: {
  rows: ReorderRecommendation[];
  suppliers: Option[];
  latestSnapshot: ReorderSnapshot | null;
}) {
  const router = useRouter();
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [descending, setDescending] = useState(true);
  const [quantities, setQuantities] = useState(() => initialQuantities(rows));
  const [selected, setSelected] = useState(() => initialSelection(rows));
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.variantId, row.supplierId ?? ''])),
  );
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  const snapshotByVariant = useMemo(
    () => new Map(latestSnapshot?.lines.map((line) => [line.variantId, line]) ?? []),
    [latestSnapshot],
  );
  const visibleRows = useMemo(() => {
    const filtered = rows.filter(
      (row) => supplierFilter === 'all' || (row.supplierKind ?? 'other') === supplierFilter,
    );
    const multiplier = descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort === 'supplier') {
        return (
          (a.supplierName ?? 'No supplier').localeCompare(b.supplierName ?? 'No supplier') *
          multiplier
        );
      }
      const compare =
        (() => {
          switch (sort) {
            case 'profit':
              return a.grossProfitCents90d - b.grossProfitCents90d;
            case 'velocity':
              return a.dailyDemand - b.dailyDemand;
            case 'risk':
              return (
                (a.daysOfCover ?? Number.POSITIVE_INFINITY) -
                (b.daysOfCover ?? Number.POSITIVE_INFINITY)
              );
            case 'cost':
              return a.landedUnitCostCents - b.landedUnitCostCents;
            default:
              return a.score - b.score;
          }
        })() * multiplier;
      return compare || a.name.localeCompare(b.name);
    });
  }, [rows, supplierFilter, sort, descending]);

  const selectedItems = rows
    .filter((row) => selected[row.variantId])
    .map((row) => {
      const parsedQuantity = Number.parseInt(quantities[row.variantId] ?? '0', 10);
      return {
        variantId: row.variantId,
        supplierId: supplierOverrides[row.variantId] || null,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
        reason: row.reasons.join(' · '),
      };
    })
    .filter((item) => item.quantity > 0);

  const create = useAction(createDraftPurchaseOrders, {
    onSuccess: ({ data }) => {
      const count = data?.created.length ?? 0;
      toast.success(`${count} draft purchase order${count === 1 ? '' : 's'} created`, {
        description: 'Review shipping and import costs before raising them.',
      });
      router.push('/purchase-orders');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create draft POs'),
  });

  function updateQuantity(variantId: string, value: string) {
    setQuantities((current) => ({ ...current, [variantId]: value }));
  }

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title={`${rows.filter((row) => row.recommendedQty > 0).length} reorder decisions`}
        hint="Full need stays visible; budget-fit quantity is only an advisory starting point"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Supplier filter"
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              className="h-8 w-auto min-w-[130px] text-[12px]"
            >
              <option value="all">All suppliers</option>
              <option value="amazon">Amazon</option>
              <option value="aliexpress">AliExpress</option>
              <option value="other">Other / missing</option>
            </Select>
            <Select
              aria-label="Sort recommendations"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-8 w-auto min-w-[130px] text-[12px]"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  Sort: {label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Sort ${descending ? 'ascending' : 'descending'}`}
              onClick={() => setDescending((current) => !current)}
            >
              {descending ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </Button>
          </div>
        }
      />

      {latestSnapshot ? (
        <div
          className={`border-b px-4 py-2 text-[12px] ${
            latestSnapshot.status === 'failed'
              ? 'border-negative/30 bg-negative-muted text-negative'
              : 'border-line-subtle bg-inset text-ink-3'
          }`}
        >
          {latestSnapshot.status === 'failed'
            ? `Last scheduled run failed: ${latestSnapshot.error ?? 'check the server log'}`
            : `Last saved snapshot: ${new Date(latestSnapshot.runDate).toLocaleDateString(
                'en-US',
                {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                },
              )}. Arrows compare this live review with that snapshot.`}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-[13px]">
          <thead className="border-line-subtle border-b bg-inset text-[11px] text-ink-4 uppercase tracking-[.07em]">
            <tr>
              <th className="w-10 px-4 py-3" aria-label="Include" />
              <th className="px-3 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium">Supplier</th>
              <th className="px-3 py-3 text-right font-medium">Score</th>
              <th className="px-3 py-3 text-right font-medium">90d profit</th>
              <th className="px-3 py-3 text-right font-medium">Cover</th>
              <th className="px-3 py-3 text-right font-medium">Full need</th>
              <th className="px-3 py-3 text-right font-medium">Budget fit</th>
              <th className="px-3 py-3 font-medium">PO qty</th>
              <th className="px-3 py-3 text-right font-medium">Est. cost</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const previous = snapshotByVariant.get(row.variantId);
              const change = previous ? row.recommendedQty - previous.recommendedQty : null;
              const quantity = quantities[row.variantId] ?? '0';
              const quantityNumber = Number.parseInt(quantity, 10) || 0;
              const supplierId = supplierOverrides[row.variantId] ?? '';
              return (
                <tr
                  key={row.variantId}
                  className="border-line-subtle border-b align-top last:border-0"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-label={`${selected[row.variantId] ? 'Remove' : 'Include'} ${row.name}`}
                      aria-pressed={selected[row.variantId]}
                      onClick={() =>
                        setSelected((current) => ({
                          ...current,
                          [row.variantId]: !current[row.variantId],
                        }))
                      }
                      className={`grid size-5 place-items-center rounded border transition-colors ${
                        selected[row.variantId]
                          ? 'border-accent bg-accent text-white'
                          : 'border-line-strong text-transparent hover:border-accent'
                      }`}
                    >
                      <Check className="size-3.5" />
                    </button>
                  </td>
                  <td className="max-w-[240px] px-3 py-3">
                    <p className="font-medium text-ink">{row.name}</p>
                    <p className="mt-1 text-[11px] text-ink-4">
                      {row.weightGrams && row.weightGrams > 0
                        ? `${row.weightGrams.toLocaleString()} g / unit`
                        : 'Weight missing'}
                      {row.strategicStock ? ' · strategic' : ''}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Select
                      aria-label={`Supplier for ${row.name}`}
                      value={supplierId}
                      onChange={(event) =>
                        setSupplierOverrides((current) => ({
                          ...current,
                          [row.variantId]: event.target.value,
                        }))
                      }
                      className="h-8 min-w-[150px] text-[12px]"
                    >
                      <option value="">Choose supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="tabular font-medium text-ink">{row.score.toFixed(0)}</span>
                    {change !== null ? (
                      <span
                        className={`mt-1 flex items-center justify-end gap-0.5 text-[11px] ${
                          change > 0
                            ? 'text-positive'
                            : change < 0
                              ? 'text-negative'
                              : 'text-ink-4'
                        }`}
                      >
                        {change > 0 ? (
                          <ArrowUp className="size-3" />
                        ) : change < 0 ? (
                          <ArrowDown className="size-3" />
                        ) : null}
                        {change === 0 ? 'same' : Math.abs(change)} vs last
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Money cents={row.grossProfitCents90d} size="sm" tone="muted" />
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-2">
                    {row.daysOfCover === null ? '—' : `${row.daysOfCover.toFixed(0)}d`}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-2">
                    {row.recommendedQty}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-2">
                    {row.budgetQty}
                    {row.deferredQty > 0 ? (
                      <span className="block text-[11px] text-warning">
                        +{row.deferredQty} deferred
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      aria-label={`Purchase quantity for ${row.name}`}
                      numeric
                      inputMode="numeric"
                      min={0}
                      value={quantity}
                      onChange={(event) => updateQuantity(row.variantId, event.target.value)}
                      className="h-8 w-16 text-right text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Money cents={quantityNumber * row.landedUnitCostCents} size="sm" />
                    {row.weightGrams === 0 ? (
                      <span className="block text-[11px] text-warning">no weight</span>
                    ) : null}
                  </td>
                  <td className="max-w-[300px] px-4 py-3 text-[12px] leading-relaxed text-ink-3">
                    {row.reasons.length > 0 ? row.reasons.join(' · ') : 'Manual review'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? (
        <p className="p-10 text-center text-[13px] text-ink-3">
          No recommendations match this filter.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-line-subtle border-t bg-inset px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-[12px] text-ink-3">
          <input
            type="checkbox"
            checked={allowDuplicates}
            onChange={(event) => setAllowDuplicates(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
          />
          Allow duplicate variants already present on an open PO
        </label>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="tabular text-[12px] text-ink-3">
            {selectedItems.length} selected ·{' '}
            <Money
              cents={selectedItems.reduce((sum, item) => {
                const row = rows.find((candidate) => candidate.variantId === item.variantId);
                return sum + item.quantity * (row?.landedUnitCostCents ?? 0);
              }, 0)}
              size="sm"
            />
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              if (selectedItems.length === 0) {
                toast.error('Select at least one product with a positive quantity.');
                return;
              }
              create.execute({
                allowDuplicateOpenLines: allowDuplicates,
                items: selectedItems,
              });
            }}
            disabled={create.status === 'executing'}
          >
            {create.status === 'executing' ? 'Creating drafts…' : 'Create draft PO'}
          </Button>
        </div>
      </div>
    </Surface>
  );
}
