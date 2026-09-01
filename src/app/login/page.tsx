import type { Metadata } from 'next';
import { Wordmark } from '@/components/shell/wordmark';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,480px)]">
      {/* The plate. A single quiet field of the brand palette, only ever seen
          here, so the working application stays near-monochrome. */}
      <aside className="relative hidden overflow-hidden border-line-subtle border-r bg-sunken lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(120% 90% at 12% 8%, var(--nx-chart-3) 0%, transparent 55%), radial-gradient(90% 80% at 88% 92%, var(--nx-chart-4) 0%, transparent 50%), radial-gradient(70% 70% at 60% 40%, var(--nx-chart-1) 0%, transparent 60%)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--nx-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--nx-border-subtle) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(80% 70% at 50% 45%, black, transparent)',
          }}
        />

        <div className="relative flex h-full flex-col justify-between p-10">
          <Wordmark />
          <div className="max-w-sm">
            <p className="text-[22px] text-ink leading-snug tracking-[-0.02em]">
              Every unit, every rate, every cent accounted for.
            </p>
            <p className="mt-3 text-[13px] text-ink-3 leading-relaxed">
              Purchase orders costed with freight and fees included, stock valued at what it
              actually cost, and a cash ledger that cannot drift from the documents behind it.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[320px]">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <h1 className="mt-8 font-medium text-[18px] text-ink tracking-[-0.02em] lg:mt-0">
            Sign in
          </h1>
          <p className="mt-1 mb-6 text-[13px] text-ink-3">
            Nextly is invite-only. Use the address your account was created with.
          </p>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
