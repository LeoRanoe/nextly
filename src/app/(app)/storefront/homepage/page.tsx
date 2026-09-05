import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { getSettings } from '@/server/queries/reference';
import { listHomepageCollections } from '@/server/queries/catalog';

export const metadata: Metadata = { title: 'Homepage configuration' };

/** The storefront has an intentionally fixed retail layout. This overview
 * makes its real sources visible without becoming a generic page builder. */
export default async function HomepageConfigurationPage() {
  const [settings, collections] = await Promise.all([getSettings(), listHomepageCollections()]);
  const sections = [
    ['Hero', settings?.heroTitle ?? 'Switch to smart. Switch to Nextly.', settings?.heroBody ?? 'Uses the storefront settings fallback.'],
    ['Shop by goal', `${collections.length} visible collections`, collections.length ? collections.map((collection) => collection.name).join(' · ') : 'No homepage collections configured.'],
    ['Just arrived', `Default window: ${settings?.defaultNewArrivalDays ?? 30} days`, 'Products require a defensible new-until date before they are labelled new.'],
    ['Support', settings?.supportTitle ?? 'Need help choosing?', settings?.supportBody ?? 'Uses the storefront settings fallback.'],
  ] as const;
  return <><PageHeader title="Homepage configuration" description="A fixed specialist-retail layout, configured from real catalog and operational data." /><div className="grid gap-3 lg:grid-cols-2">{sections.map(([title, value, detail]) => <Surface key={title} className="p-5"><p className="text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">{title}</p><p className="mt-2 font-medium text-ink">{value}</p><p className="mt-1 text-[13px] leading-relaxed text-ink-3">{detail}</p></Surface>)}</div><p className="mt-5 text-[13px] text-ink-3">Edit hero, support, fulfilment and payment display in <Link className="text-accent hover:underline" href={'/settings' as Route}>Settings</Link>. Manage the customer-goal sections in <Link className="text-accent hover:underline" href={'/storefront/collections' as Route}>Storefront collections</Link>.</p></>;
}
