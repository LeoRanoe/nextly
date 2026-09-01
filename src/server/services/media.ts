import { del, putImage } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { productImages } from '../db/schema';
import type { Tx } from './posting';

/**
 * Turning an uploaded original into the two stored derivatives and the
 * `product_images` row, per docs/04-engineering/media-pipeline.md.
 *
 * Called from two places that must produce the same result: the
 * `onUploadCompleted` webhook (`src/app/api/blob/upload/route.ts`), which is
 * how this runs in production, and the `finalizeProductImageUpload` action
 * (`actions/media.ts`), which exists because that webhook cannot reach a
 * machine behind NAT and so never fires on localhost. Both call this, and
 * both are safe to call for the same upload — see the idempotency note
 * below — so whichever runs first wins and the other is a no-op.
 */

const DISPLAY_WIDTH = 1600;
const THUMB_WIDTH = 400;
const QUALITY = 75;

export async function recordProductImage(
  tx: Tx,
  input: {
    productId: string;
    variantId?: string | null;
    originalUrl: string;
    originalPathname: string;
    /** Read client-side before upload (`createImageBitmap`) and carried
     *  through as the upload token's payload — putImage's response has no
     *  dimensions of its own to read back. */
    width: number;
    height: number;
    alt?: string | null;
  },
): Promise<{ id: string } | null> {
  // Idempotent: the webhook retries up to five times on anything but a 200,
  // and the dev-only fallback can race it if a tunnel happens to be up.
  // Recording the same upload twice is a worse failure than skipping a
  // duplicate, so check first.
  const [existing] = await tx
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.blobPathname, input.originalPathname))
    .limit(1);
  if (existing) return existing;

  const source = new URL(input.originalUrl);
  const basePath = input.originalPathname.replace(/\.[^./]+$/, '');

  const [display, thumb] = await Promise.all([
    putImage(`${basePath}-1600.avif`, source, {
      access: 'public',
      optimizeImage: { width: DISPLAY_WIDTH, quality: QUALITY, format: 'avif' },
    }),
    putImage(`${basePath}-400.webp`, source, {
      access: 'public',
      optimizeImage: { width: THUMB_WIDTH, quality: QUALITY, format: 'webp' },
    }),
  ]);

  // Only the derivatives are kept — storing the original too would roughly
  // triple the bill for a file nobody ever serves directly.
  await del(input.originalPathname).catch(() => {
    // A failed delete leaves an orphaned original blob, not a broken image —
    // worth logging, not worth failing the upload over.
    console.error(`[media] could not delete original blob ${input.originalPathname}`);
  });

  const [row] = await tx
    .select({ max: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, input.productId))
    .orderBy(productImages.position)
    .limit(1);
  const isFirst = !row;

  const [inserted] = await tx
    .insert(productImages)
    .values({
      productId: input.productId,
      variantId: input.variantId ?? null,
      url: display.url,
      blobPathname: display.pathname,
      thumbUrl: thumb.url,
      thumbPathname: thumb.pathname,
      width: input.width,
      height: input.height,
      alt: input.alt ?? null,
      position: isFirst ? 0 : await nextPosition(tx, input.productId),
      isPrimary: isFirst,
    })
    .returning({ id: productImages.id });

  return inserted ?? null;
}

async function nextPosition(tx: Tx, productId: string): Promise<number> {
  const rows = await tx
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  return rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
}

/** Delete both stored derivatives. Called before the row itself is
 *  removed — orphaned pathnames are how the store silently accumulates
 *  blobs nothing references and Vercel bills for indefinitely. */
export async function deleteProductImageBlobs(image: {
  blobPathname: string;
  thumbPathname: string | null;
}): Promise<void> {
  const pathnames = [image.blobPathname, image.thumbPathname].filter((value): value is string =>
    Boolean(value),
  );
  if (pathnames.length === 0) return;
  await del(pathnames).catch(() => {
    console.error(`[media] could not delete blob(s) ${pathnames.join(', ')}`);
  });
}
