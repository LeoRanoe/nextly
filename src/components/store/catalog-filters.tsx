'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';

export function CatalogFilters({
  options,
}: {
  options: {
    brands: { name: string; slug: string }[];
    platforms: string[];
    protocols: string[];
  };
}) {
  const [filters, setFilters] = useQueryStates(
    {
      brand: parseAsString,
      platform: parseAsString,
      protocol: parseAsString,
      hub: parseAsString,
      indoorOutdoor: parseAsString,
      new: parseAsString,
      price: parseAsString,
      page: parseAsString,
    },
    { shallow: false, history: 'replace' },
  );
  const set = (key: keyof typeof filters, value: string) =>
    setFilters({ [key]: value || null, page: null });
  return (
    <details className="w-full border-t border-line-subtle pt-3">
      <summary className="cursor-pointer text-[12px] font-medium text-ink-2">
        More filters
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          aria-label="Brand"
          value={filters.brand ?? ''}
          onChange={(event) => set('brand', event.target.value)}
        >
          <option value="">All brands</option>
          {options.brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </Select>
        {options.platforms.length ? (
          <Select
            aria-label="Platform"
            value={filters.platform ?? ''}
            onChange={(event) => set('platform', event.target.value)}
          >
            <option value="">All platforms</option>
            {options.platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </Select>
        ) : null}
        {options.protocols.length ? (
          <Select
            aria-label="Protocol"
            value={filters.protocol ?? ''}
            onChange={(event) => set('protocol', event.target.value)}
          >
            <option value="">All protocols</option>
            {options.protocols.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocol}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          aria-label="Hub requirement"
          value={filters.hub ?? ''}
          onChange={(event) => set('hub', event.target.value)}
        >
          <option value="">Any hub requirement</option>
          <option value="not-required">No hub required</option>
          <option value="required">Hub required</option>
        </Select>
        <Select
          aria-label="Indoor or outdoor"
          value={filters.indoorOutdoor ?? ''}
          onChange={(event) => set('indoorOutdoor', event.target.value)}
        >
          <option value="">Indoor or outdoor</option>
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
          <option value="indoor-outdoor">Indoor &amp; outdoor</option>
        </Select>
        <Select
          aria-label="New arrivals"
          value={filters.new ?? ''}
          onChange={(event) => set('new', event.target.value)}
        >
          <option value="">All arrival dates</option>
          <option value="true">New arrivals</option>
        </Select>
        <Select
          aria-label="Price range"
          value={filters.price ?? ''}
          onChange={(event) => set('price', event.target.value)}
        >
          <option value="">All prices</option>
          <option value="under-50">Under US$50</option>
          <option value="50-100">US$50–100</option>
          <option value="100-250">US$100–250</option>
          <option value="250-plus">US$250+</option>
        </Select>
      </div>
    </details>
  );
}
