'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { ConvertQuoteDialog } from '@/components/forms/quote-convert-dialog';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import type { QuoteRequestStatus } from '@/lib/schemas';
import { setQuoteRequestStatus } from '@/server/actions/quotes';
import type { QuoteVariantOption } from '@/server/queries/quotes';

/**
 * Per-row actions for a quote request (F-5).
 *
 * Status flips are one click with no prompt — they post nothing and are
 * trivially reversible, so a dialog would just train people to click through
 * it. Conversion is the only heavy action and gets its own sheet, because it
 * creates two records and a customer out of a visitor's message.
 */
export function QuoteRequestActions({
  id,
  name,
  quantity,
  status,
  variants,
}: {
  id: string;
  name: string;
  quantity: number;
  status: QuoteRequestStatus;
  variants: QuoteVariantOption[];
}) {
  const router = useRouter();

  const statusAction = useAction(setQuoteRequestStatus, {
    onSuccess({ data }) {
      toast.success(`${data?.name}'s request updated`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update the request'),
  });

  // A converted request lives on as its sale; there is nothing left to do
  // here beyond reading it.
  if (status === 'converted') return null;

  return (
    <Menu>
      {status === 'new' ? (
        <Item onSelect={() => statusAction.execute({ id, status: 'contacted' })}>
          Mark contacted
        </Item>
      ) : null}
      {status === 'contacted' ? (
        <Item onSelect={() => statusAction.execute({ id, status: 'new' })}>Back to new</Item>
      ) : null}
      {status === 'declined' ? (
        <ConvertQuoteDialog
          requestId={id}
          requesterName={name}
          quantity={quantity}
          variants={variants}
          inMenu
        />
      ) : (
        <Item danger onSelect={() => statusAction.execute({ id, status: 'declined' })}>
          Decline
        </Item>
      )}
    </Menu>
  );
}
