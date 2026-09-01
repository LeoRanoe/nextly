import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Raise a purchase order' };

export default function Page() {
  return (
    <>
      <PageHeader title="Raise a purchase order" />
      <Upcoming
        what="Entering an order captures the goods and the freight, tax and card fees separately. Marking it received allocates those costs across the lines and creates the stock receipts."
        instead="See purchase orders"
        href="/purchase-orders"
      />
    </>
  );
}
