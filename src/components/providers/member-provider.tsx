'use client';

import { createContext, type ReactNode, use } from 'react';

/**
 * The signed-in member's role, available to any client component in the app
 * shell without an extra query.
 *
 * `requireMember()` has already run in `(app)/layout.tsx` by the time this
 * mounts, and `Topbar` already receives the same three fields — this just
 * makes `role` reachable from row actions too, so the UI can stop offering
 * what the server will refuse. The server still enforces every write; this
 * only decides what to show.
 */
export type CurrentMember = {
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
};

const MemberContext = createContext<CurrentMember | null>(null);

export function MemberProvider({
  member,
  children,
}: {
  member: CurrentMember;
  children: ReactNode;
}) {
  return <MemberContext value={member}>{children}</MemberContext>;
}

export function useMember(): CurrentMember {
  const member = use(MemberContext);
  if (!member) {
    throw new Error('useMember must be used within the (app) shell, under MemberProvider.');
  }
  return member;
}
