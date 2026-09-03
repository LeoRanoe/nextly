import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentActions } from '@/components/invoice/document-actions';
import { InvoicePaper } from '@/components/invoice/invoice-paper';
import { getPublicInvoice } from '@/server/queries/invoices';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Invoice / Factuur',
  robots: { index: false, follow: false },
};
export const instant = false;
/** Customer-facing invoice link. The token is the only credential. */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [sale, settings] = await Promise.all([getPublicInvoice(token), getSettings()]);
  if (!sale) notFound();

  return (
    <main className="mx-auto max-w-[820px] px-4 py-8 text-ink">
      <DocumentActions />
      <InvoicePaper sale={sale} settings={settings} />
    </main>
  );
}
