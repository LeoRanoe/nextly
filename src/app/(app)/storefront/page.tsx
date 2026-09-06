import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import {
  getStorefrontOverview,
  listActionableRestockAlerts,
} from '@/server/queries/storefront';

export const metadata: Metadata = { title: 'Storefront' };

export default async function StorefrontPage() {
  const [overview, restockAlerts] = await Promise.all([
    getStorefrontOverview(),
    listActionableRestockAlerts(),
  ]);
  const metrics = [
    ['Published products', overview.published],
    ['In stock', overview.inStock],
    ['Out of stock', overview.outOfStock],
    ['Incoming units', overview.incoming],
    ['Restock requests waiting', overview.waitingRestocks],
    ['Quote requests, 30 days', overview.recentQuotes],
  ];
  return (
    <>
      <PageHeader
        title="Storefront"
        description="What customers can see and the operational demand behind it."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <Surface key={label as string} className="p-4">
            <p className="text-[12px] text-ink-3">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular text-ink">{value}</p>
          </Surface>
        ))}
      </div>
      {restockAlerts.length ? (
        <Surface className="mt-5">
          <div className="border-line-subtle border-b px-4 py-3">
            <h2 className="text-[13px] font-medium text-ink">Customers waiting for stock</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Stock is now available. Contacting customers remains a manual action.
            </p>
          </div>
          <ul className="divide-y divide-line-subtle">
            {restockAlerts.map((alert) => (
              <li
                key={`${alert.productName}-${alert.variantName}`}
                className="px-4 py-3 text-[13px]"
              >
                <span className="font-medium text-ink">
                  {alert.waitingCount} customer{alert.waitingCount === 1 ? '' : 's'} waiting for{' '}
                  {alert.productName}
                  {alert.variantName ? ` · ${alert.variantName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3 text-[13px]">
        <Link className="text-accent hover:underline" href={'/storefront/homepage' as Route}>
          Homepage configuration
        </Link>
        <Link className="text-accent hover:underline" href={'/storefront/restock' as Route}>
          Manage restock requests
        </Link>
        <Link className="text-accent hover:underline" href={'/storefront/collections' as Route}>
          Manage collections
        </Link>
        <Link className="text-accent hover:underline" href="/settings">
          Storefront settings
        </Link>
        <Link className="text-accent hover:underline" href="/products">
          Improve catalog products
        </Link>
      </div>
    </>
  );
}
