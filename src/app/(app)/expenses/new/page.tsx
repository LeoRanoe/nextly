import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Log an expense' };

export default function Page() {
  return (
    <>
      <PageHeader title="Log an expense" />
      <Upcoming
        what="A running cost with its category, currency and the rate that applied on the day."
        instead="See expenses"
        href="/expenses"
      />
    </>
  );
}
