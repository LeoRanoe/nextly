import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form field wrapper: label, control, hint, error.
 *
 * The hint sits *above* the control, not below it. A hint below is read after
 * the mistake has already been made; above, it is read while deciding what to
 * type. The error replaces the hint, because showing both at once gives the
 * reader two things to reconcile at the exact moment they are already stuck.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          {label}
          {required ? <span className="ml-0.5 text-negative">*</span> : null}
        </label>
        {error ? (
          <span id={describedBy} className="text-[11px] text-negative" role="alert">
            {error}
          </span>
        ) : hint ? (
          <span id={describedBy} className="text-[11px] text-ink-4">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const control = [
  'h-9 w-full rounded-control border bg-raised px-2.5 text-[13px] text-ink',
  'transition-colors duration-150 outline-none',
  'placeholder:text-ink-4',
  'focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:border-negative',
];

export function Input({
  className,
  numeric,
  ...props
}: ComponentProps<'input'> & { numeric?: boolean }) {
  return (
    <input
      className={cn(control, 'border-line', numeric && 'tabular text-right', className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        control,
        'border-line',
        'h-auto min-h-[72px] resize-y py-2 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}

/** Native select. Radix Select is reserved for cases that need rich options;
 *  for a short list of plain strings the native control is faster, keyboard
 *  accessible for free, and correct on mobile. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        control,
        'border-line',
        'appearance-none bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat pr-8',
        "[background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7a8a' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    />
  );
}

/** A group of fields on one row. Collapses to a single column on narrow
 *  screens, because two 40%-width inputs are worse than one full-width one. */
export function FieldRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-3 sm:grid-cols-2', className)} {...props} />;
}

/** Prefix or suffix inside a control, for currency symbols and units. */
export function InputAffix({
  affix,
  position = 'start',
  className,
  children,
}: {
  affix: ReactNode;
  position?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative flex items-center', className)}>
      {position === 'start' ? (
        <span className="tabular pointer-events-none absolute left-2.5 text-[12px] text-ink-4">
          {affix}
        </span>
      ) : null}
      {children}
      {position === 'end' ? (
        <span className="tabular pointer-events-none absolute right-2.5 text-[12px] text-ink-4">
          {affix}
        </span>
      ) : null}
    </div>
  );
}
