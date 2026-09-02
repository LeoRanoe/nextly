'use client';

import { parseAsStringEnum, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';

/**
 * The catalog grid's sort order, as URL state — the same `shallow: false`
 * mechanism `ListSearch`/`ListFilter` use, sized for a fixed set of options
 * rather than an arbitrary one, so it always carries a real value instead of
 * the "no filter" empty option those two default to.
 */
const CATALOG_SORTS = ['newest', 'name', 'price-asc', 'price-desc'] as const;
type CatalogSortValue = (typeof CATALOG_SORTS)[number];

const LABELS: Record<CatalogSortValue, string> = {
  newest: 'Newest',
  name: 'Name, A–Z',
  'price-asc': 'Price, low to high',
  'price-desc': 'Price, high to low',
};

export function CatalogSort() {
  const [{ sort }, setState] = useQueryStates(
    { sort: parseAsStringEnum<CatalogSortValue>([...CATALOG_SORTS]).withDefault('newest') },
    { shallow: false, history: 'replace' },
  );

  return (
    <Select
      aria-label="Sort by"
      value={sort}
      onChange={(event) => setState({ sort: event.target.value as CatalogSortValue })}
      className="h-8 w-auto min-w-[160px] text-[12px]"
    >
      {CATALOG_SORTS.map((value) => (
        <option key={value} value={value}>
          {LABELS[value]}
        </option>
      ))}
    </Select>
  );
}
