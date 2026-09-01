import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Record a cash movement' };

export default function Page() {
  return (
    <>
      <PageHeader title="Record a cash movement" />
      <Upcoming
        what="A manual ledger entry for capital in, owner draws, or anything not already posted by a document."
        instead="See the ledger"
        href="/ledger"
      />
    </>
  );
}
