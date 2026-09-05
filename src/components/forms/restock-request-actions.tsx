'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import type { RestockRequestStatus } from '@/lib/schemas';
import { setRestockRequestStatus } from '@/server/actions/restock';

/**
 * Restock requests are demand history, not outbound automation. These
 * intentional status changes let the team keep that history honest after a
 * manual WhatsApp/email follow-up or a resulting sale.
 */
export function RestockRequestActions({
  id,
  contact,
  status,
}: {
  id: string;
  contact: string;
  status: RestockRequestStatus;
}) {
  const router = useRouter();
  const action = useAction(setRestockRequestStatus, {
    onSuccess: () => {
      toast.success(`Restock request for ${contact} updated`);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update the request'),
  });

  return (
    <Menu>
      {status === 'waiting' ? <Item onSelect={() => action.execute({ id, status: 'contacted' })}>Mark contacted</Item> : null}
      {status === 'contacted' ? <Item onSelect={() => action.execute({ id, status: 'waiting' })}>Back to waiting</Item> : null}
      {status !== 'converted' && status !== 'cancelled' ? <Item onSelect={() => action.execute({ id, status: 'converted' })}>Mark converted</Item> : null}
      {status === 'cancelled' ? <Item onSelect={() => action.execute({ id, status: 'waiting' })}>Restore waiting</Item> : <Item danger onSelect={() => action.execute({ id, status: 'cancelled' })}>Cancel request</Item>}
    </Menu>
  );
}
