import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { getStorefrontOverview } from '@/server/queries/storefront';

export const metadata: Metadata = { title: 'Storefront' };

export default async function StorefrontPage() {
  const overview = await getStorefrontOverview();
  const metrics = [['Published products', overview.published], ['In stock', overview.inStock], ['Out of stock', overview.outOfStock], ['Incoming units', overview.incoming], ['Restock requests waiting', overview.waitingRestocks], ['Quote requests, 30 days', overview.recentQuotes]];
  return <><PageHeader title="Storefront" description="What customers can see and the operational demand behind it." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <Surface key={label as string} className="p-4"><p className="text-[12px] text-ink-3">{label}</p><p className="mt-1 text-2xl font-semibold tabular text-ink">{value}</p></Surface>)}</div><div className="mt-5 flex flex-wrap gap-3 text-[13px]"><Link className="text-accent hover:underline" href={'/storefront/homepage' as Route}>Homepage configuration</Link><Link className="text-accent hover:underline" href={'/storefront/restock' as Route}>Manage restock requests</Link><Link className="text-accent hover:underline" href={'/storefront/collections' as Route}>Manage collections</Link><Link className="text-accent hover:underline" href="/settings">Storefront settings</Link><Link className="text-accent hover:underline" href="/products">Improve catalog products</Link></div></>;
}
