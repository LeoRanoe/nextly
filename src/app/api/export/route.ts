import { NextResponse } from 'next/server';

/**
 * CSV downloads (F-7).
 *
 * A plain GET rather than a server action returning a string: the browser's
 * native download handling (progress, filename, no RSC payload carrying a
 * megabyte of text through the React tree) only exists for real URLs. The
 * links are server-rendered anchors in each list's toolbar, so the current
 * filters ride along in the query string and no client JS is involved.
 *
 * Auth lives in `buildExport` → `requireMember`, which redirects (/login or
 * /no-access) — legal here because this is a route handler, not an action.
 *
 * `entity=backup` is the special case that streams every list at once — the
 * Settings-page quick backup (F-7 also asks for a full-database export).
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      error: 'CSV export is temporarily unavailable while CRUD workflows are being completed.',
    },
    { status: 410 },
  );
}
