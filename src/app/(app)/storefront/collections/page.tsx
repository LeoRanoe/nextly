import type { Metadata } from 'next';
import { CreateStorefrontCollection } from '@/components/forms/storefront-collection-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { listStorefrontCollectionsForDashboard } from '@/server/queries/storefront';

export const metadata: Metadata = { title: 'Storefront collections' };

export default async function StorefrontCollectionsPage() {
  const collections = await listStorefrontCollectionsForDashboard();
  return <><PageHeader title="Storefront collections" description="Customer-intention groupings separate from product categories." action={<CreateStorefrontCollection />} /><Surface className="overflow-hidden"><ul className="divide-y divide-line-subtle">{collections.map((collection) => <li key={collection.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-[13px]"><div><p className="font-medium text-ink">{collection.name}</p><p className="mt-0.5 text-ink-3">/{collection.slug}{collection.description ? ` · ${collection.description}` : ''}</p></div><div className="flex gap-3 text-ink-3"><span>{collection.productCount} products</span><span>{collection.homepageVisible ? 'Homepage' : 'Hidden'}</span><span>{collection.active ? 'Active' : 'Inactive'}</span></div></li>)}{collections.length === 0 ? <li className="p-4 text-[13px] text-ink-3">No collections yet. Add customer goals once the catalog supports them.</li> : null}</ul></Surface></>;
}
