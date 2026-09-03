'use server';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { publicEnv } from '@/lib/env';
import { createPublicToken } from '@/lib/public-token';
import { uuid } from '@/lib/schemas';
import { db } from '../db/client';
import { sales } from '../db/schema';
import { logActivity, type Tx } from '../services/posting';
import { ActionError, writeAction } from './client';

async function lockSale(tx: Tx, saleId: string) {
  await tx.execute(sql`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`);
  const [sale] = await tx
    .select({ id: sales.id, number: sales.number, status: sales.status })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  return sale;
}

/** Create or rotate a secure customer-facing invoice link. */
export const createPublicInvoiceLink = writeAction
  .metadata({ action: 'created', entity: 'public invoice link' })
  .inputSchema(z.object({ saleId: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const token = createPublicToken();
    const result = await db.transaction(async (tx) => {
      const sale = await lockSale(tx, input.saleId);
      if (!sale) throw new ActionError('That sale no longer exists.');
      if (sale.status !== 'confirmed') {
        throw new ActionError('Only a confirmed sale can be shared as an invoice.');
      }
      await tx
        .update(sales)
        .set({ publicTokenHash: token.hash, updatedAt: new Date() })
        .where(eq(sales.id, sale.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'rotated public invoice link',
        entityType: 'sale',
        entityId: sale.id,
        entityLabel: sale.number,
      });
      return { number: sale.number };
    });
    const baseUrl = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    return { ...result, url: `${baseUrl}/d/invoice/${token.raw}` };
  });
