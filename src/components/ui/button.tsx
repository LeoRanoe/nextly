import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Buttons in the Instrument language.
 *
 * Deliberately not the stock shadcn button. Tighter radius, a 1px inner
 * highlight on solid fills so they read as physical in dark mode, and a
 * pressed state that actually moves. Height steps are 28/32/36, not the
 * default 36/40/44: this is a dense operations tool, not a marketing page.
 */
const button = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap',
    'select-none rounded-control font-medium',
    'transition-[background-color,border-color,color,box-shadow,translate] duration-150',
    'ease-out-instrument',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:translate-y-px',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:bg-accent-hover',
        secondary:
          'border border-line bg-raised text-ink shadow-[var(--nx-shadow-raised),inset_0_1px_0_0_var(--nx-highlight)] hover:border-line-strong hover:bg-hover',
        ghost: 'text-ink-2 hover:bg-hover hover:text-ink',
        danger:
          'bg-negative text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:brightness-110',
        outline: 'border border-accent-border bg-transparent text-accent hover:bg-accent-muted',
        link: 'h-auto p-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-[13px]',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-9 px-4 text-sm',
        icon: 'size-8 p-0',
        'icon-sm': 'size-7 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof button> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
