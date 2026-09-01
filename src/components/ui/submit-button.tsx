'use client';

import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from './button';

/**
 * Submit control with a pending state.
 *
 * The label stays put while the spinner appears beside it, rather than being
 * replaced by "Saving...". A button that changes width mid-click shifts
 * everything next to it, and on a slow connection that happens right as
 * someone is moving the mouse toward Cancel.
 */
export function SubmitButton({
  pending,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type="submit" variant="primary" disabled={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
