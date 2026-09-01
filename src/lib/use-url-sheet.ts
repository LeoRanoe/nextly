'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * A sheet whose open state lives in the URL.
 *
 * Two things fall out of this that local state cannot give: the command palette
 * can deep-link straight into "log an expense", and Back closes the sheet
 * instead of leaving the page, which is what people reflexively press.
 *
 * `replace`, not `push`, when closing: the open and closed states of a drawer
 * are not two places worth stepping back through.
 */
export function useUrlSheet(key: string): [boolean, (open: boolean) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const open = params.get(key) !== null;

  const setOpen = useCallback(
    (next: boolean) => {
      const updated = new URLSearchParams(params.toString());
      if (next) updated.set(key, '1');
      else updated.delete(key);

      const query = updated.toString();
      router.replace(
        `${pathname}${query ? `?${query}` : ''}` as Parameters<typeof router.replace>[0],
      );
    },
    [key, params, pathname, router],
  );

  return [open, setOpen];
}
