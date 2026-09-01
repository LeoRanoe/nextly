'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/** Toasts, restyled onto the Instrument surfaces. Bottom-right, so they never
 *  cover the action bar at the foot of a sheet. */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'rounded-card border border-line bg-overlay text-ink shadow-overlay text-[13px]',
          description: 'text-ink-3 text-[12px]',
          actionButton: 'bg-accent text-accent-fg rounded-control text-[12px]',
          cancelButton: 'bg-inset text-ink-2 rounded-control text-[12px]',
          error: 'border-negative/40',
          success: 'border-positive/40',
        },
      }}
    />
  );
}
