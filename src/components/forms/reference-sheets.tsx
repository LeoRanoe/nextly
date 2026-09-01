'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { useUrlSheet } from '@/lib/use-url-sheet';
import {
  createCategory,
  createCustomer,
  createSupplier,
  inviteMember,
} from '@/server/actions/reference';

/**
 * The short forms: customers, categories, suppliers, team members.
 *
 * Grouped in one file because they share a shape — open a sheet, fill three or
 * four fields, close it — and splitting four near-identical twenty-line forms
 * across four files makes them harder to keep consistent, not easier.
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function Trigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="primary" onClick={onClick}>
      <Plus className="size-4" /> {label}
    </Button>
  );
}

function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  formId,
  pending,
  submitLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description?: string;
  formId: string;
  pending: boolean;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton form={formId} pending={pending}>
            {submitLabel}
          </SubmitButton>
        </>
      }
    >
      {children}
    </Sheet>
  );
}

/* ── Customers ───────────────────────────────────────────────────────────── */

export function CustomerSheet() {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('new-customer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');

  const { execute, isPending } = useAction(createCustomer, {
    onSuccess({ data }) {
      toast.success(`${data?.name} added`, { description: `Code ${data?.code}` });
      setOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      setAddressLine('');
      setCity('');
      setNotes('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not add the customer');
    },
  });

  return (
    <>
      <Trigger label="Add customer" onClick={() => setOpen(true)} />
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Add a customer"
        description="A code is allocated automatically. Order counts and lifetime spend are derived from confirmed sales and never typed in."
        formId="customer-form"
        pending={isPending}
        submitLabel="Add customer"
      >
        <form
          id="customer-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              name,
              phone: phone || undefined,
              email: email || undefined,
              addressLine: addressLine || undefined,
              city: city || undefined,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Details">
            <Field label="Name" htmlFor="c-name" required>
              <Input
                id="c-name"
                value={name}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <FieldRow>
              <Field label="Phone" htmlFor="c-phone">
                <Input
                  id="c-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="c-email">
                <Input
                  id="c-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Address" htmlFor="c-address">
                <Input
                  id="c-address"
                  value={addressLine}
                  onChange={(event) => setAddressLine(event.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="c-city">
                <Input
                  id="c-city"
                  value={city}
                  placeholder="Paramaribo"
                  onChange={(event) => setCity(event.target.value)}
                />
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor="c-notes">
              <Textarea
                id="c-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </FormSheet>
    </>
  );
}

/* ── Categories ──────────────────────────────────────────────────────────── */

export function CategorySheet() {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('new-category');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const { execute, isPending } = useAction(createCategory, {
    onSuccess({ data }) {
      toast.success(`${data?.name} added`);
      setOpen(false);
      setName('');
      setSlug('');
      setSlugTouched(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not add the category');
    },
  });

  return (
    <>
      <Trigger label="Add category" onClick={() => setOpen(true)} />
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Add a category"
        description="How products are grouped, here and on the public catalog."
        formId="category-form"
        pending={isPending}
        submitLabel="Add category"
      >
        <form
          id="category-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({ name, slug: slug || slugify(name) });
          }}
        >
          <SheetSection title="Details">
            <Field label="Name" htmlFor="cat-name" required>
              <Input
                id="cat-name"
                value={name}
                required
                placeholder="Smart home"
                onChange={(event) => {
                  setName(event.target.value);
                  if (!slugTouched) setSlug(slugify(event.target.value));
                }}
              />
            </Field>
            <Field label="Slug" htmlFor="cat-slug" hint="Public URL" required>
              <Input
                id="cat-slug"
                value={slug}
                required
                className="tabular"
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
              />
            </Field>
          </SheetSection>
        </form>
      </FormSheet>
    </>
  );
}

/* ── Suppliers ───────────────────────────────────────────────────────────── */

export function SupplierSheet() {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('new-supplier');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'amazon' | 'aliexpress' | 'other'>('other');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');

  const { execute, isPending } = useAction(createSupplier, {
    onSuccess({ data }) {
      toast.success(`${data?.name} added`);
      setOpen(false);
      setName('');
      setWebsite('');
      setNotes('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not add the supplier');
    },
  });

  return (
    <>
      <Trigger label="Add supplier" onClick={() => setOpen(true)} />
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Add a supplier"
        description="Where stock is bought."
        formId="supplier-form"
        pending={isPending}
        submitLabel="Add supplier"
      >
        <form
          id="supplier-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              name,
              kind,
              website: website || undefined,
              notes: notes || undefined,
            });
          }}
        >
          <SheetSection title="Details">
            <Field label="Name" htmlFor="s-name" required>
              <Input
                id="s-name"
                value={name}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Kind" htmlFor="s-kind">
              <Select
                id="s-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option value="amazon">Amazon</option>
                <option value="aliexpress">AliExpress</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Website" htmlFor="s-website">
              <Input
                id="s-website"
                type="url"
                value={website}
                placeholder="https://"
                onChange={(event) => setWebsite(event.target.value)}
              />
            </Field>
            <Field label="Notes" htmlFor="s-notes">
              <Textarea
                id="s-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </SheetSection>
        </form>
      </FormSheet>
    </>
  );
}

/* ── Team ────────────────────────────────────────────────────────────────── */

export function MemberSheet() {
  const router = useRouter();
  const [open, setOpen] = useUrlSheet('invite');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'staff' | 'viewer'>('staff');
  const [isPrincipal, setIsPrincipal] = useState(false);

  const { execute, isPending } = useAction(inviteMember, {
    onSuccess({ data }) {
      toast.success(`${data?.fullName} invited`, {
        description: `They can sign in at any time with ${data?.email}.`,
      });
      setOpen(false);
      setFullName('');
      setEmail('');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not send the invitation');
    },
  });

  return (
    <>
      <Trigger label="Invite" onClick={() => setOpen(true)} />
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title="Invite someone"
        description="Creating the record is the invitation. Nothing is emailed: they sign in with this address at the normal sign-in page, and their first sign-in claims the invitation."
        formId="member-form"
        pending={isPending}
        submitLabel="Invite"
      >
        <form
          id="member-form"
          onSubmit={(event) => {
            event.preventDefault();
            execute({ fullName, email, role, isPrincipal });
          }}
        >
          <SheetSection title="Person">
            <Field label="Full name" htmlFor="m-name" required>
              <Input
                id="m-name"
                value={fullName}
                required
                onChange={(event) => setFullName(event.target.value)}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="m-email"
              hint="Must match what they sign in with"
              required
            >
              <Input
                id="m-email"
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </SheetSection>

          <SheetSection title="Access">
            <Field label="Role" htmlFor="m-role">
              <Select
                id="m-role"
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <option value="viewer">Viewer — read only</option>
                <option value="staff">Staff — record sales and orders</option>
                <option value="owner">Owner — everything, including the team</option>
              </Select>
            </Field>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-inset p-3">
              <input
                type="checkbox"
                checked={isPrincipal}
                onChange={(event) => setIsPrincipal(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--nx-accent)]"
              />
              <span>
                <span className="block text-[13px] text-ink">Holds capital</span>
                <span className="mt-0.5 block text-[11px] text-ink-4 leading-relaxed">
                  They appear in the equity split and can be named on owner contributions and
                  draws. Separate from their role.
                </span>
              </span>
            </label>
          </SheetSection>
        </form>
      </FormSheet>
    </>
  );
}
