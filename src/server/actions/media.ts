'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { productImages } from '../db/schema';
import { deleteProductImageBlobs, recordProductImage } from '../services/media';
import { logActivity } from '../services/posting';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * Product images. See docs/04-engineering/media-pipeline.md for the pipeline
 * these actions sit downstream of; `services/media.ts` holds the shared
 * derivative-and-insert logic this file's `finalizeProductImageUpload` and
 * the upload webhook (`src/app/api/blob/upload/route.ts`) both call.
 */

/**
 * The dev-only equivalent of the `onUploadCompleted` webhook, which cannot
 * reach a machine behind NAT and so never fires on localhost. The client
 * calls this immediately after `upload()` resolves, every time, in every
 * environment — `recordProductImage` is idempotent on the original blob's
 * pathname, so if the webhook also fires (as it will in production) the
 * second call is a no-op rather than a duplicate row.
 */
export const finalizeProductImageUpload = writeAction
  .metadata({ action: 'uploaded', entity: 'product image' })
  .inputSchema(
    z.object({
      productId: uuid,
      url: z.string().url(),
      pathname: z.string().min(1),
      width: z.coerce.number().int().positive(),
      height: z.coerce.number().int().positive(),
      alt: z.string().trim().max(200).optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const image = await recordProductImage(tx, {
        productId: input.productId,
        originalUrl: input.url,
        originalPathname: input.pathname,
        width: input.width,
        height: input.height,
        alt: input.alt,
      });

      if (image) {
        await logActivity(tx, {
          memberId: ctx.member.id,
          action: 'uploaded product image',
          entityType: 'product',
          entityId: input.productId,
        });
      }

      return image;
    });
    return result;
  });

/** `ownerAction`, matching the RLS policy: DELETE on product_images is
 *  granted to `private.is_owner()` only, and Drizzle bypasses RLS, so the
 *  app layer is what actually enforces this. */
export const removeProductImage = ownerAction
  .metadata({ action: 'deleted', entity: 'product image' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [image] = await tx
        .select()
        .from(productImages)
        .where(eq(productImages.id, input.id))
        .limit(1);

      if (!image) throw new ActionError('That image no longer exists.');

      await tx.delete(productImages).where(eq(productImages.id, input.id));

      // A primary image that just got deleted needs a successor, or the
      // product silently has none — promote whichever sorts first.
      if (image.isPrimary) {
        const [next] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .where(eq(productImages.productId, image.productId))
          .orderBy(productImages.position)
          .limit(1);
        if (next) {
          await tx
            .update(productImages)
            .set({ isPrimary: true })
            .where(eq(productImages.id, next.id));
        }
      }

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'deleted product image',
        entityType: 'product',
        entityId: image.productId,
      });

      await deleteProductImageBlobs(image);
    });
    return { id: input.id };
  });

export const setPrimaryProductImage = writeAction
  .metadata({ action: 'updated', entity: 'product image' })
  .inputSchema(z.object({ id: uuid, productId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      await tx
        .update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, input.productId));
      await tx
        .update(productImages)
        .set({ isPrimary: true })
        .where(eq(productImages.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'set primary product image',
        entityType: 'product',
        entityId: input.productId,
      });
    });
    return { id: input.id };
  });

export const reorderProductImages = writeAction
  .metadata({ action: 'updated', entity: 'product image' })
  .inputSchema(z.object({ productId: uuid, orderedIds: z.array(uuid).min(1) }))
  .action(async ({ parsedInput: input }) => {
    await db.transaction(async (tx) => {
      for (const [index, id] of input.orderedIds.entries()) {
        await tx.update(productImages).set({ position: index }).where(eq(productImages.id, id));
      }
    });
    return { productId: input.productId };
  });
