'use client';

import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { publicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

type State = { status: 'idle' | 'sending' | 'sent'; error?: string };

/**
 * Sign-in is a one-time email link, not a password.
 *
 * Nextly has two owners and maybe a couple of staff. A password adds a secret
 * to store, rotate and leak for no security gain at this size, and the email
 * inbox is already the recovery channel a password would fall back to.
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount rather than with the autoFocus attribute. The page has
  // exactly one field and exists only to receive it, so this orients everyone
  // rather than disorienting anyone -- but doing it here also means focus
  // returns to the field when someone backs out of the sent state.
  useEffect(() => {
    if (state.status === 'idle') inputRef.current?.focus();
  }, [state.status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setState({ status: 'sending' });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
        // An auth account grants nothing on its own. Access is the `members`
        // row, which only an owner can create, so a stranger who signs in
        // here reaches /no-access and sees no data. Gating account creation
        // itself would need the service key to send mail server-side, and
        // would leak which addresses are members. See
        // docs/01-architecture/security.md.
        shouldCreateUser: true,
      },
    });

    if (error) {
      setState({ status: 'idle', error: error.message });
      return;
    }
    setState({ status: 'sent' });
  }

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-control bg-positive-muted text-positive">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <p className="font-medium text-[14px] text-ink">Check your inbox</p>
          <p className="mt-1 text-[13px] text-ink-3 leading-relaxed">
            A sign-in link is on its way to{' '}
            <span className="tabular text-ink-2">{email.trim()}</span>. It expires in one hour.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setState({ status: 'idle' })}
          className="text-[12px] text-accent underline-offset-4 hover:underline"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          ref={inputRef}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@nextly.com"
          className="h-9 rounded-control border border-line bg-raised px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </div>

      {state.error ? (
        <p className="text-[12px] text-negative" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={state.status === 'sending'}
        className="mt-1 w-full"
      >
        {state.status === 'sending' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending
          </>
        ) : (
          <>
            Send sign-in link <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
