'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { type ReactNode, useId, useState } from 'react';
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
  updateCategory,
  updateCustomer,
  updateMember,
  updateSupplier,
} from '@/server/actions/reference';

/**
 * The short forms: customers, categories, suppliers, team members.
 *
 * Grouped in one file because they share a shape — open a sheet, fill three or
 * four fields, close it — and splitting four near-identical twenty-line forms
 * across four files makes them harder to keep consistent, not easier.
 *
 * Each sheet does double duty as create AND edit: pass `initial` to seed it
 * from a row (edit mode) or omit it for a blank form with its own trigger
 * (create mode). `open`/`onOpenChange` are for a caller driving the sheet
 * itself — a row action — rather than the sheet's own URL-backed trigger.
 * `useUrlSheet` still runs unconditionally either way, since hooks cannot be
 * called conditionally; its return value is simply unused when the sheet is
 * externally controlled.
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

export type CustomerValues = {
  id: string;
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  notes: string;
};

export function CustomerSheet({
  initial,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  /** Omit for a blank form with its own "Add customer" trigger. */
  initial?: CustomerValues;
  /** Pass both to drive the sheet from a row action instead of the URL. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const router = useRouter();
  const urlSheet = useUrlSheet('new-customer');
  const open = openProp ?? urlSheet[0];
  const setOpen = onOpenChangeProp ?? urlSheet[1];
  const isEdit = Boolean(initial);
  const formId = useId();

  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Two separate hook calls, not `useAction(isEdit ? updateCustomer : createCustomer)`:
  // TypeScript cannot always assign a union of two SafeActionFn types (their
  // input schemas differ by exactly the `id` field) to the single function
  // type useAction's generic inference expects — it depends on how large and
  // how structurally distinct the two schemas are, and customer/category/
  // supplier/member all hit it where product's more complex schema happens
  // not to. Calling both hooks unconditionally (never conditionally — that
  // would break the rules of hooks) and picking the result is the version
  // that typechecks regardless.
  const resetCreateFields = () => {
    setName('');
    setPhone('');
    setEmail('');
    setAddressLine('');
    setCity('');
    setNotes('');
  };
  const createHook = useAction(createCustomer, {
    onSuccess({ data }) {
      toast.success(`${data?.name} added`, { description: `Code ${data?.code}` });
      setOpen(false);
      resetCreateFields();
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not add the customer');
    },
  });
  const updateHook = useAction(updateCustomer, {
    onSuccess({ data }) {
      toast.success(`${data?.name} updated`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the customer');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  return (
    <>
      {initial === undefined ? (
        <Trigger label="Add customer" onClick={() => setOpen(true)} />
      ) : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? 'Edit customer' : 'Add a customer'}
        description={
          isEdit
            ? undefined
            : 'A code is allocated automatically. Order counts and lifetime spend are derived from confirmed sales and never typed in.'
        }
        formId={formId}
        pending={isPending}
        submitLabel={isEdit ? 'Save changes' : 'Add customer'}
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            // `execute` is a union of the create and update action's own
            // function types (see the comment above), so TypeScript cannot
            // check a single call against both — the branch above already
            // guarantees the right shape reaches the right action.
            execute({
              ...(isEdit ? { id: initial?.id as string } : {}),
              name,
              phone: phone || undefined,
              email: email || undefined,
              addressLine: addressLine || undefined,
              city: city || undefined,
              notes: notes || undefined,
            } as never);
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

export type CategoryValues = { id: string; name: string; slug: string };

export function CategorySheet({
  initial,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  initial?: CategoryValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const router = useRouter();
  const urlSheet = useUrlSheet('new-category');
  const open = openProp ?? urlSheet[0];
  const setOpen = onOpenChangeProp ?? urlSheet[1];
  const isEdit = Boolean(initial);
  const formId = useId();

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  // Two hook calls, always both — see the comment in CustomerSheet above.
  const createHook = useAction(createCategory, {
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
  const updateHook = useAction(updateCategory, {
    onSuccess({ data }) {
      toast.success(`${data?.name} updated`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the category');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  return (
    <>
      {initial === undefined ? (
        <Trigger label="Add category" onClick={() => setOpen(true)} />
      ) : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? 'Edit category' : 'Add a category'}
        description="How products are grouped, here and on the public catalog."
        formId={formId}
        pending={isPending}
        submitLabel={isEdit ? 'Save changes' : 'Add category'}
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              ...(isEdit ? { id: initial?.id as string } : {}),
              name,
              slug: slug || slugify(name),
            } as never);
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

export type SupplierValues = {
  id: string;
  name: string;
  kind: 'amazon' | 'aliexpress' | 'other';
  website: string;
  notes: string;
};

export function SupplierSheet({
  initial,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  initial?: SupplierValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const router = useRouter();
  const urlSheet = useUrlSheet('new-supplier');
  const open = openProp ?? urlSheet[0];
  const setOpen = onOpenChangeProp ?? urlSheet[1];
  const isEdit = Boolean(initial);
  const formId = useId();

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<'amazon' | 'aliexpress' | 'other'>(initial?.kind ?? 'other');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Two hook calls, always both — see the comment in CustomerSheet above.
  const createHook = useAction(createSupplier, {
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
  const updateHook = useAction(updateSupplier, {
    onSuccess({ data }) {
      toast.success(`${data?.name} updated`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the supplier');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  return (
    <>
      {initial === undefined ? (
        <Trigger label="Add supplier" onClick={() => setOpen(true)} />
      ) : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? 'Edit supplier' : 'Add a supplier'}
        description="Where stock is bought."
        formId={formId}
        pending={isPending}
        submitLabel={isEdit ? 'Save changes' : 'Add supplier'}
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              ...(isEdit ? { id: initial?.id as string } : {}),
              name,
              kind,
              website: website || undefined,
              notes: notes || undefined,
            } as never);
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

export type MemberValues = {
  id: string;
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
  isPrincipal: boolean;
};

export function MemberSheet({
  initial,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  initial?: MemberValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const router = useRouter();
  const urlSheet = useUrlSheet('invite');
  const open = openProp ?? urlSheet[0];
  const setOpen = onOpenChangeProp ?? urlSheet[1];
  const isEdit = Boolean(initial);
  const formId = useId();

  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<'owner' | 'staff' | 'viewer'>(initial?.role ?? 'staff');
  const [isPrincipal, setIsPrincipal] = useState(initial?.isPrincipal ?? false);

  // Two hook calls, always both — see the comment in CustomerSheet above.
  const createHook = useAction(inviteMember, {
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
  const updateHook = useAction(updateMember, {
    onSuccess({ data }) {
      toast.success(`${data?.fullName} updated`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the member');
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  return (
    <>
      {initial === undefined ? <Trigger label="Invite" onClick={() => setOpen(true)} /> : null}
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={isEdit ? 'Edit team member' : 'Invite someone'}
        description={
          isEdit
            ? undefined
            : 'Creating the record is the invitation. Nothing is emailed: they sign in with this address at the normal sign-in page, and their first sign-in claims the invitation.'
        }
        formId={formId}
        pending={isPending}
        submitLabel={isEdit ? 'Save changes' : 'Invite'}
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            execute({
              ...(isEdit ? { id: initial?.id as string } : {}),
              fullName,
              email,
              role,
              isPrincipal,
            } as never);
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
