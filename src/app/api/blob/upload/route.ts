import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireWrite } from '@/server/auth';
import { db } from '@/server/db/client';
import { recordProductImage } from '@/server/services/media';

/**
 * Client-upload token issuance and completion webhook, per
 * docs/04-engineering/media-pipeline.md.
 *
 * A Server Action's body is capped at 4.5 MB on Vercel, and a phone photo
 * routinely exceeds that — the browser uploads straight to the blob store
 * via `upload()` from `@vercel/blob/client`, and this route only ever sees
 * a pathname and a token request, never the file itself.
 *
 * `onUploadCompleted` is how this runs in production: Vercel calls it after
 * the upload finishes, and retries up to five times if this does not return
 * 200 — `recordProductImage` is written to be safe to run more than once for
 * the same upload. It never fires on localhost (the webhook cannot reach a
 * machine behind NAT), which is why `finalizeProductImageUpload`
 * (`actions/media.ts`) exists as the client-triggered equivalent for dev.
 */

type ClientPayload = { productId: string; width: number; height: number; alt?: string };

function parseClientPayload(raw: string | null): ClientPayload {
  if (!raw) throw new Error('Missing upload payload.');
  const parsed = JSON.parse(raw) as Partial<ClientPayload>;
  if (!parsed.productId || !parsed.width || !parsed.height) {
    throw new Error('Upload payload is missing productId, width or height.');
  }
  return {
    productId: parsed.productId,
    width: parsed.width,
    height: parsed.height,
    alt: parsed.alt,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // The only place this upload is authorised. For the case that
        // matters here — a signed-in viewer with no write access — this
        // throws ActionError and the catch below turns it into a clean 400.
        // A genuinely signed-out request redirects instead (requireMember's
        // usual behaviour), which is an acceptable edge case: the upload
        // button this call comes from only renders inside the (app) shell,
        // which has already required a session to reach it.
        await requireWrite();
        const payload = parseClientPayload(clientPayload);

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          tokenPayload: JSON.stringify(payload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseClientPayload(tokenPayload ?? null);
        await db.transaction((tx) =>
          recordProductImage(tx, {
            productId: payload.productId,
            originalUrl: blob.url,
            originalPathname: blob.pathname,
            width: payload.width,
            height: payload.height,
            alt: payload.alt,
          }),
        );
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 400 },
    );
  }
}
