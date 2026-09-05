'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { createStorefrontCollection } from '@/server/actions/collections';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** A collection is an intent-led storefront grouping, not a product category. */
export function CreateStorefrontCollection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [homepageVisible, setHomepageVisible] = useState(false);
  const action = useAction(createStorefrontCollection, {
    onSuccess: () => { toast.success('Collection created'); setOpen(false); setName(''); setSlug(''); setDescription(''); router.refresh(); },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create the collection'),
  });
  return <><Button size="sm" onClick={() => setOpen(true)}>New collection</Button><Sheet open={open} onOpenChange={setOpen} title="Storefront collection" description="Use collections for a customer goal, such as “Protect your home”; keep product taxonomy in Categories." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton form="storefront-collection-form" pending={action.isPending}>Create</SubmitButton></>}><form id="storefront-collection-form" onSubmit={(event) => { event.preventDefault(); action.execute({ name, slug: slug || slugify(name), description: description || undefined, active: true, homepageVisible, position: 0 }); }}><SheetSection title="Collection details"><Field label="Name" htmlFor="collection-name" required><Input id="collection-name" value={name} required onChange={(event) => { setName(event.target.value); if (!slug) setSlug(slugify(event.target.value)); }} /></Field><Field label="URL slug" htmlFor="collection-slug" required><Input id="collection-slug" value={slug} required onChange={(event) => setSlug(slugify(event.target.value))} /></Field><Field label="Short description" htmlFor="collection-description"><Textarea id="collection-description" value={description} onChange={(event) => setDescription(event.target.value)} /></Field><label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={homepageVisible} onChange={(event) => setHomepageVisible(event.target.checked)} /> Show this collection on the homepage</label></SheetSection></form></Sheet></>;
}
