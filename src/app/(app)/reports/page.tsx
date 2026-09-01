import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Profit and loss over a chosen period, margin by product, and exposure to the exchange rate."
      />
      <Upcoming
        what="Reports are next after the entry forms. Everything they need is already in the ledgers: profit and loss, margin ranked by product, and how much of the balance sheet moves when the SRD rate does."
        instead="See the Overview"
        href="/"
      />
    </>
  );
}
