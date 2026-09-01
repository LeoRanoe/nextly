import { ShieldQuestion } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { Wordmark } from '@/components/shell/wordmark';
import { Skeleton } from '@/components/ui/skeleton';
import { getAuthUser } from '@/server/auth';

export const metadata: Metadata = { title: 'No access' };

/**
 * Signed in, but no member row.
 *
 * Deliberately not a redirect back to /login: bouncing someone to a form they
 * just completed is the most confusing thing an app can do. Tell them what
 * actually happened and who can fix it.
 *
 * The shell prerenders; only the line naming their address needs the session
 * cookie, so that alone sits behind a Suspense boundary.
 */
export default function NoAccessPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px]">
        <Wordmark />
        <div className="mt-8 flex size-9 items-center justify-center rounded-control bg-warning-muted text-warning">
          <ShieldQuestion className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          This account has no access yet
        </h1>

        <Suspense
          fallback={
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-[13px] w-full" />
              <Skeleton className="h-[13px] w-4/5" />
            </div>
          }
        >
          <Explanation />
        </Suspense>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

async function Explanation() {
  const user = await getAuthUser();
  return (
    <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
      You are signed in
      {user?.email ? (
        <>
          {' as '}
          <span className="tabular text-ink-2">{user.email}</span>
        </>
      ) : null}
      , but that address has not been invited to Nextly. An owner can add it from Settings, and
      this page will then let you straight through.
    </p>
  );
}
