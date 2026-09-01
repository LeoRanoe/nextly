import type { Metadata } from 'next';
import { PageHeader } from '@/components/patterns/page-header';
import { Upcoming } from '@/components/patterns/upcoming';

export const metadata: Metadata = { title: 'Add a product' };

export default function Page() {
  return (
    <>
      <PageHeader title="Add a product" />
      <Upcoming
        what="A product with a variant for each colour or size, images uploaded to Vercel Blob, and the pricing that a sale defaults to."
        instead="See products"
        href="/products"
      />
    </>
  );
}
