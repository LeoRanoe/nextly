'use client';

import { useQueryState } from 'nuqs';
import { useCallback } from 'react';

/**
 * A sheet whose open state lives in the URL.
 *
 * Two things fall out of this that local state cannot give: the command
 * palette can deep-link straight into "log an expense", and Back closes the
 * sheet instead of leaving the page, which is what people reflexively press.
 *
 * `history: 'replace'` on every transition, open and close alike: the open
 * and closed states of a drawer are not two places worth stepping back
 * through, so neither writes a new history entry. A command-palette Link
 * still pushes its own entry on the way in, which is what lets Back close
 * the sheet rather than skip past it.
 *
 * Built on nuqs (`useQueryState`) rather than a hand-rolled
 * `useSearchParams()` + `router.replace`, now that list pages
 * (`lib/list-params.ts`) read and write the URL through nuqs too — one
 * writer for the querystring avoids the two fighting over the same update.
 *
 * Reserved keys already in the querystring, so a new one should avoid
 * these: sheet triggers — `new`, `new-customer`, `new-category`,
 * `new-supplier`, `invite`; list state — `q`, `status`, `from`, `to`,
 * `sort`, `dir`, `page`; detail-page edit mode — `editing` (deliberately not
 * `edit`, which stays free for a future per-row `?edit=<uuid>` on a list).
 */
export function useUrlSheet(key: string): [boolean, (open: boolean) => void] {
  const [value, setValue] = useQueryState(key, {
    history: 'replace',
    shallow: false,
  });

  const open = value !== null;

  const setOpen = useCallback(
    (next: boolean) => {
      setValue(next ? '1' : null);
    },
    [setValue],
  );

  return [open, setOpen];
}
