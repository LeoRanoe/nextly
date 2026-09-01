import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Record a sale' };

export default function Page() {
  return (
    <>
      <PageHeader title="Record a sale" />
      <Upcoming
        what="Recording a sale will move stock, book the cost of goods at weighted-average landed cost, and post the receipt to the cash ledger, all in one transaction. It shows live margin as you type."
        instead="See sales"
        href="/sales"
      />
    </>
  );
}
