'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { addProductToStorefrontCollection, removeProductFromStorefrontCollection } from '@/server/actions/collections';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Surface, SurfaceHeader } from '@/components/ui/surface';

export function ProductStorefrontCollections({ productId, memberships, collections }: { productId: string; memberships: { id: string; name: string; slug: string; position: number }[]; collections: { id: string; name: string }[] }) {
  const router = useRouter(); const [collectionId, setCollectionId] = useState('');
  const add = useAction(addProductToStorefrontCollection, { onSuccess: () => { toast.success('Added to collection'); setCollectionId(''); router.refresh(); }, onError: ({ error }) => toast.error(error.serverError ?? 'Could not add collection') });
  const remove = useAction(removeProductFromStorefrontCollection, { onSuccess: () => { toast.success('Removed from collection'); router.refresh(); }, onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove collection') });
  const available = collections.filter((collection) => !memberships.some((membership) => membership.id === collection.id));
  return <Surface><SurfaceHeader title="Storefront collections" hint="Use customer goals, not product categories." /><div className="space-y-3 p-4"><div className="flex gap-2"><Select aria-label="Storefront collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="flex-1"><option value="">Add to collection</option>{available.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</Select><Button type="button" size="sm" disabled={!collectionId || add.isPending} onClick={() => add.execute({ collectionId, productId, position: memberships.length })}>Add</Button></div>{memberships.length ? <ul className="divide-y divide-line-subtle border-y border-line-subtle">{memberships.map((membership) => <li key={membership.id} className="flex items-center justify-between py-2 text-[13px]"><span className="text-ink">{membership.name}<span className="ml-2 text-ink-3">/{membership.slug}</span></span><Button type="button" variant="ghost" size="sm" onClick={() => remove.execute({ collectionId: membership.id, productId })}>Remove</Button></li>)}</ul> : <p className="text-[13px] text-ink-3">Not in a storefront collection yet.</p>}</div></Surface>;
}
