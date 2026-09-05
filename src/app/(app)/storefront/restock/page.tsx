import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { listRestockRequests } from '@/server/queries/storefront';

export const metadata: Metadata = { title: 'Restock requests' };
export default async function RestockPage() {
  const rows = await listRestockRequests();
  return <><PageHeader title="Restock requests" description="Customer interest recorded from unavailable catalog products. Contacting a customer is always a manual team action." /><Surface className="overflow-hidden"><ul className="divide-y divide-line-subtle">{rows.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 p-4 text-[13px]"><span><strong>{row.productName}</strong>{row.variantName ? ` · ${row.variantName}` : ''}<span className="ml-2 text-ink-3">{row.contact} via {row.channel}</span></span><span className="capitalize text-ink-3">{row.status}</span></li>)}{rows.length === 0 ? <li className="p-4 text-[13px] text-ink-3">No restock requests yet.</li> : null}</ul></Surface></>;
}
