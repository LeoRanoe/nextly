import type { Metadata } from 'next';
import { BundleManager } from '@/components/forms/bundle-manager';
import { ExportCsvLink } from '@/components/patterns/export-csv-link';
import { PageHeader } from '@/components/patterns/page-header';
import { listBundleOptions, listVariantOptions } from '@/server/queries/pickers';

export const metadata: Metadata = { title: 'Bundles' };

export default async function BundlesPage() {
  const [bundles, variants] = await Promise.all([listBundleOptions(), listVariantOptions()]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Bundles"
        description="Sell a group of products as one line while Nextly tracks component stock and weighted-average cost."
        action={<ExportCsvLink entity="bundles" />}
      />
      <BundleManager bundles={bundles} variants={variants} />
    </div>
  );
}
