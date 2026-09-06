'use client';

import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { createRestockRequest } from '@/server/actions/restock';

export function RestockRequestForm({
  productId,
  variantId,
}: {
  productId: string;
  variantId?: string;
}) {
  const [contact, setContact] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [website, setWebsite] = useState('');
  const { execute, isPending } = useAction(createRestockRequest, {
    onSuccess: () => {
      setContact('');
      toast.success("We'll keep your request for the team.");
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save your request.'),
  });
  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        execute({ productId, variantId: variantId ?? null, contact, channel, website });
      }}
    >
      <label className="sr-only" htmlFor="restock-contact">
        WhatsApp number or email
      </label>
      <label className="sr-only" htmlFor="restock-website" aria-hidden="true">
        Website
      </label>
      <input
        id="restock-website"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <Input
        id="restock-contact"
        required
        value={contact}
        onChange={(event) => setContact(event.target.value)}
        placeholder={channel === 'email' ? 'you@example.com' : 'WhatsApp number'}
      />
      <select
        value={channel}
        onChange={(event) => setChannel(event.target.value as 'whatsapp' | 'email')}
        className="h-10 rounded-control border border-line bg-raised px-2 text-[12px] text-ink"
      >
        <option value="whatsapp">WhatsApp</option>
        <option value="email">Email</option>
      </select>
      <Button type="submit" disabled={isPending} variant="secondary">
        {isPending ? 'Saving…' : 'Notify me'}
      </Button>
    </form>
  );
}
