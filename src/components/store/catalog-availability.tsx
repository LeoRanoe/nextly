'use client';

import { parseAsStringEnum, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';

const AVAILABILITY = ['in-stock', 'incoming'] as const;
type Availability = (typeof AVAILABILITY)[number];

/** Real availability only: on-hand stock or outstanding purchase orders. */
export function CatalogAvailability() {
  const [{ availability }, setState] = useQueryStates(
    { availability: parseAsStringEnum<Availability>([...AVAILABILITY]) },
    { shallow: false, history: 'replace' },
  );
  return <Select aria-label="Availability" value={availability ?? ''} onChange={(event) => setState({ availability: (event.target.value || null) as Availability | null })} className="h-11 w-auto min-w-[148px] rounded-full border-line-subtle pl-4 text-[14px]"><option value="">All availability</option><option value="in-stock">In stock</option><option value="incoming">Coming next</option></Select>;
}
