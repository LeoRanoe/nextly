'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { inviteMember } from '@/server/actions/reference';

export function InviteMemberSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'staff' | 'viewer'>('staff');
  const [isPrincipal, setIsPrincipal] = useState(false);
  const formId = useId();

  const invite = useAction(inviteMember, {
    onSuccess({ data }) {
      toast.success(`${data?.fullName} invited`);
      setOpen(false);
      setFullName('');
      setEmail('');
      setRole('staff');
      setIsPrincipal(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not send the invitation'),
  });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Invite member
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Invite team member"
        description="Supabase will send them a sign-in link. Their access starts with the role you choose here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={invite.isPending}>
              Send invitation
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            invite.execute({ fullName, email, role, isPrincipal });
          }}
        >
          <SheetSection title="Person">
            <Field label="Full name" htmlFor={`${formId}-name`} required>
              <Input
                id={`${formId}-name`}
                value={fullName}
                required
                onChange={(event) => setFullName(event.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor={`${formId}-email`} required>
              <Input
                id={`${formId}-email`}
                type="email"
                value={email}
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </SheetSection>
          <SheetSection title="Access">
            <Field label="Role" htmlFor={`${formId}-role`}>
              <Select
                id={`${formId}-role`}
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
                  Include them in the owner equity split.
                </span>
              </span>
            </label>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
