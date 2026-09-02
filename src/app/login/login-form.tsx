'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type State = { status: 'idle' | 'signingIn'; error?: string };

/**
 * Sign-in uses Supabase password auth. The account itself lives in Supabase;
 * no credential is stored in the frontend or repository.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('nextly@admin.com');
  const [password, setPassword] = useState('');
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
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;

    setState({ status: 'signingIn' });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setState({ status: 'idle', error: error.message });
      return;
    }

    // Same open-redirect guard as /auth/callback: a same-origin absolute
    // path, or nowhere anyone asked to go.
    const requested = searchParams.get('next');
    const next =
      requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
    router.replace(next as Parameters<typeof router.replace>[0]);
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

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[11px] text-ink-3 uppercase tracking-[0.08em]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
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
        disabled={state.status === 'signingIn'}
        className="mt-1 w-full"
      >
        {state.status === 'signingIn' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Signing in
          </>
        ) : (
          <>
            Sign in <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
