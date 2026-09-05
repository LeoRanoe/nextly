'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { createProductRelationship, deleteProductRelationship } from '@/server/actions/relationships';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import type { ProductRelationshipRow } from '@/server/queries/reference';

const TYPES = [['works_with', 'Works well with'], ['accessory', 'Accessory'], ['required_accessory', 'Required accessory'], ['alternative', 'Alternative'], ['cheaper_alternative', 'Cheaper alternative'], ['premium_alternative', 'Premium alternative']] as const;

export function ProductRelationships({ productId, relationships, options }: { productId: string; relationships: ProductRelationshipRow[]; options: { id: string; name: string }[] }) {
  const router = useRouter();
  const [relatedProductId, setRelatedProductId] = useState('');
  const [relationshipType, setRelationshipType] = useState<ProductRelationshipRow['relationshipType']>('works_with');
  const create = useAction(createProductRelationship, { onSuccess: () => { toast.success('Relationship added'); setRelatedProductId(''); router.refresh(); }, onError: ({ error }) => toast.error(error.serverError ?? 'Could not add relationship') });
  const remove = useAction(deleteProductRelationship, { onSuccess: () => { toast.success('Relationship removed'); router.refresh(); }, onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove relationship') });
  const available = options.filter((option) => !relationships.some((relationship) => relationship.relatedProductId === option.id && relationship.relationshipType === relationshipType));
  return <Surface><SurfaceHeader title="Related products" hint="Explicit relationships are what the storefront shows; there is no random recommendation carousel." /><div className="space-y-3 p-4"><div className="flex flex-wrap gap-2"><Select aria-label="Relationship type" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as ProductRelationshipRow['relationshipType'])} className="min-w-[180px]">{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select aria-label="Related product" value={relatedProductId} onChange={(event) => setRelatedProductId(event.target.value)} className="min-w-[220px] flex-1"><option value="">Choose a product</option>{available.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select><Button type="button" size="sm" disabled={!relatedProductId || create.isPending} onClick={() => create.execute({ productId, relatedProductId, relationshipType, position: relationships.length })}>Add</Button></div>{relationships.length ? <ul className="divide-y divide-line-subtle border-y border-line-subtle">{relationships.map((relationship) => <li key={relationship.id} className="flex items-center justify-between gap-3 py-2 text-[13px]"><span><span className="font-medium text-ink">{relationship.relatedProductName}</span><span className="ml-2 text-ink-3">{TYPES.find(([value]) => value === relationship.relationshipType)?.[1]}</span></span><Button type="button" variant="ghost" size="sm" onClick={() => remove.execute(relationship.id)}>Remove</Button></li>)}</ul> : <p className="text-[13px] text-ink-3">No related products yet.</p>}</div></Surface>;
}
