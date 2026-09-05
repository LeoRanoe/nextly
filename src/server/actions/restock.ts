'use server';

import { and, eq } from 'drizzle-orm';
import { restockRequestSchema, restockRequestStatusSchema } from '@/lib/schemas';
import { db } from '../db/client';
import { products, productVariants, restockRequests } from '../db/schema';
import { logActivity } from '../services/posting';
import { ActionError, publicAction, writeAction } from './client';

/** A public request is intentionally limited to an unavailable, published
 * product. It records interest only; it never sends a message automatically. */
export const createRestockRequest = publicAction
  .metadata({ action: 'created', entity: 'restock_request' })
  .inputSchema(restockRequestSchema)
  .action(async ({ parsedInput: input }) => {
    const [product] = await db
      .select({ id: products.id, enabled: products.restockNotificationsEnabled })
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.status, 'active'),
          eq(products.catalogPublished, true),
        ),
      )
      .limit(1);
    if (!product?.enabled)
      throw new ActionError('Restock notifications are not available for this product.');
    if (input.variantId) {
      const [variant] = await db
        .select({ id: productVariants.id, productId: productVariants.productId })
        .from(productVariants)
        .where(eq(productVariants.id, input.variantId))
        .limit(1);
      if (!variant || variant.productId !== product.id)
        throw new ActionError('That option is no longer available.');
    }
    const [request] = await db
      .insert(restockRequests)
      .values({ ...input, name: input.name ?? null, variantId: input.variantId })
      .returning({ id: restockRequests.id });
    return { id: request?.id ?? '' };
  });

export const setRestockRequestStatus = writeAction
  .metadata({ action: 'updated', entity: 'restock_request' })
  .inputSchema(restockRequestStatusSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    return db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(restockRequests)
        .where(eq(restockRequests.id, input.id))
        .limit(1);
      if (!request) throw new ActionError('That restock request no longer exists.');
      await tx
        .update(restockRequests)
        .set({
          status: input.status,
          contactedAt: input.status === 'contacted' ? new Date() : request.contactedAt,
          updatedAt: new Date(),
        })
        .where(eq(restockRequests.id, input.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `marked restock request ${input.status}`,
        entityType: 'restock_request',
        entityId: input.id,
        entityLabel: request.contact,
      });
      return { id: input.id };
    });
  });
