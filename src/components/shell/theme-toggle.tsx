'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

/** Segmented three-way theme control. A single sun/moon toggle cannot express
 *  "follow the system", which is the setting most people actually want. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <fieldset className="inline-flex items-center gap-0.5 rounded-control border border-line bg-inset p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        const tooltip =
          value === 'system' && mounted
            ? `System (${resolvedTheme === 'dark' ? 'dark' : 'light'})`
            : label;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={tooltip}
            title={tooltip}
            aria-pressed={active}
            className={cn(
              'grid size-8 place-items-center rounded-[4px] transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              active
                ? 'bg-active border border-line-strong text-accent'
                : 'text-ink-4 hover:text-ink-2',
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </fieldset>
  );
}
