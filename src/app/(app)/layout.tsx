import type { ReactNode } from 'react';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { requireMember } from '@/server/auth';

/**
 * The application shell.
 *
 * Fixed 232px rail on large screens, off-canvas below. The rail is deliberately
 * narrow: this app is read at a glance and the content deserves the width.
 *
 * requireMember runs here rather than in each page, so a new route is protected
 * by existing rather than by remembering to add a guard. Server Actions still
 * authorise independently: a layout cannot protect a POST.
 */

/**
 * These routes are genuinely dynamic and say so.
 *
 * The auth check reads cookies before anything renders, which Cache Components
 * correctly refuses to prerender. Deferring it into a Suspense boundary would
 * technically restore a static shell, but it would also let a signed-in
 * non-member start rendering pages before the guard resolved. A login-gated
 * dashboard has little to gain from a prerendered shell and everything to lose
 * from a guard that runs late, so the whole segment blocks.
 *
 * The public routes (/login, /auth/error, /no-access) keep partial
 * prerendering, because those are the ones a cold visitor actually waits on.
 */
export const instant = false;
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-line-subtle border-r bg-sunken lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar
          member={{
            fullName: member.fullName,
            email: member.email,
            role: member.role,
          }}
        />
        <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
