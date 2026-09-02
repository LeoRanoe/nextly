'use client';

import { ThemeProvider as NextThemes } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({
  children,
  forcedTheme,
}: {
  children: ReactNode;
  forcedTheme?: string;
}) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      forcedTheme={forcedTheme}
      enableSystem
      disableTransitionOnChange
      storageKey="nextly-theme"
    >
      {children}
    </NextThemes>
  );
}
