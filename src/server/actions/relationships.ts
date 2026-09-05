'use server';

import { and, eq } from 'drizzle-orm';
import { productRelationshipSchema, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { productRelationships, products } from '../db/schema';
import { logActivity } from '../services/posting';
import { ActionError, writeAction } from './client';

export const createProductRelationship = writeAction.metadata({ action: 'created', entity: 'product_relationship' }).inputSchema(productRelationshipSchema).action(async ({ parsedInput: input, ctx }) => db.transaction(async (tx) => {
  const linked = await tx.select({ id: products.id }).from(products).where(eq(products.id, input.relatedProductId)).limit(1);
  if (!linked[0]) throw new ActionError('That related product no longer exists.');
  const [row] = await tx.insert(productRelationships).values(input).onConflictDoNothing().returning({ id: productRelationships.id });
  if (!row) throw new ActionError('That relationship already exists.');
  await logActivity(tx, { memberId: ctx.member.id, action: 'created product relationship', entityType: 'product_relationship', entityId: row.id, entityLabel: input.relationshipType });
  return row;
}));

export const deleteProductRelationship = writeAction.metadata({ action: 'deleted', entity: 'product_relationship' }).inputSchema(uuid).action(async ({ parsedInput: id, ctx }) => db.transaction(async (tx) => {
  const [relationship] = await tx.select().from(productRelationships).where(eq(productRelationships.id, id)).limit(1);
  if (!relationship) throw new ActionError('That relationship no longer exists.');
  await tx.delete(productRelationships).where(and(eq(productRelationships.id, id), eq(productRelationships.productId, relationship.productId)));
  await logActivity(tx, { memberId: ctx.member.id, action: 'deleted product relationship', entityType: 'product_relationship', entityId: id, entityLabel: relationship.relationshipType });
  return { id };
}));
