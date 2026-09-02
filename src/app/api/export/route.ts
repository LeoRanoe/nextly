// Deep import: the package's public server entry does not re-export this
// helper, and string-matching the digest instead would be more fragile.
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { buildExport, buildFullBackup, isExportEntity } from '@/server/exports/registry';

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
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const entity = url.searchParams.get('entity');
  const isBackup = entity === 'backup';
  if (!isBackup && !isExportEntity(entity)) {
    return new Response('Unknown export entity.', { status: 404 });
  }

  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'entity') raw[key] = value;
  }

  try {
    const csv = isBackup ? await buildFullBackup() : await buildExport(entity, raw);
    const today = new Date().toISOString().slice(0, 10);
    const filename = isBackup ? `nextly-backup-${today}.csv` : `${entity}-${today}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Fresh books beat a cached stale file; exports are per-user anyway.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // requireMember's redirect travels as a thrown NEXT_REDIRECT signal —
    // rethrow it untouched so Next performs it. Anything else is a genuine
    // failure and gets a bare message (never internals).
    if (isRedirectError(error)) throw error;
    return new Response('The export could not be generated.', { status: 500 });
  }
}
