'use server';

import { eq, sql } from 'drizzle-orm';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import {
  categorySchema,
  customerSchema,
  memberSchema,
  supplierSchema,
  uuid,
} from '@/lib/schemas';
import { db } from '../db/client';
import { categories, customers, members, suppliers } from '../db/schema';
import { TAGS } from '../queries/cache';
import { logActivity } from '../services/posting';
import { ActionError, ownerAction, writeAction } from './client';

/**
 * Allocate the next code in a `K001`-style series.
 *
 * Padded and sequential so the codes sort correctly and read as a series. This
 * one takes MAX + 1 rather than a counter table, because unlike a purchase
 * order number a customer code carries no audit weight and a gap in it means
 * nothing.
 */
async function nextCode(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: 'customers' | 'products',
  prefix: string,
): Promise<string> {
  const rows = await tx.execute<{ next: string }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
      FROM ${sql.raw(table)}
     WHERE code ~ ${`^${prefix}[0-9]+$`}
  `);
  return `${prefix}${String(Number(rows[0]?.next ?? 1)).padStart(3, '0')}`;
}

export const createCustomer = writeAction
  .metadata({ action: 'created', entity: 'customer' })
  .inputSchema(customerSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const code = await nextCode(tx, 'customers', 'K');

      const [customer] = await tx
        .insert(customers)
        .values({
          code,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      if (!customer) throw new ActionError('Could not create the customer.');

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created customer',
        entityType: 'customer',
        entityId: customer.id,
        entityLabel: customer.name,
      });

      return { id: customer.id, code: customer.code, name: customer.name };
    });

    updateTag(TAGS.customers);
    return result;
  });

export const updateCustomer = writeAction
  .metadata({ action: 'updated', entity: 'customer' })
  .inputSchema(customerSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That customer no longer exists.');

      await tx
        .update(customers)
        .set({
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          addressLine: input.addressLine ?? null,
          city: input.city ?? null,
          notes: input.notes ?? null,
        })
        .where(eq(customers.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated customer',
        entityType: 'customer',
        entityId: input.id,
        entityLabel: input.name,
      });
    });

    updateTag(TAGS.customers);
    return { name: input.name };
  });

export const createCategory = writeAction
  .metadata({ action: 'created', entity: 'category' })
  .inputSchema(categorySchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ max: sql<string>`COALESCE(MAX(position), 0)::text` })
        .from(categories);

      const [category] = await tx
        .insert(categories)
        .values({
          name: input.name,
          slug: input.slug,
          position: Number(row?.max ?? 0) + 1,
        })
        .returning();

      if (!category) throw new ActionError('Could not create the category.');

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created category',
        entityType: 'category',
        entityId: category.id,
        entityLabel: category.name,
      });

      return { id: category.id, name: category.name };
    });

    updateTag(TAGS.products);
    return result;
  });

export const createSupplier = writeAction
  .metadata({ action: 'created', entity: 'supplier' })
  .inputSchema(supplierSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .insert(suppliers)
        .values({
          name: input.name,
          kind: input.kind,
          website: input.website ?? null,
          notes: input.notes ?? null,
        })
        .returning();

      if (!supplier) throw new ActionError('Could not create the supplier.');

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created supplier',
        entityType: 'supplier',
        entityId: supplier.id,
        entityLabel: supplier.name,
      });

      return { id: supplier.id, name: supplier.name };
    });

    updateTag(TAGS.products);
    updateTag(TAGS.purchaseOrders);
    return result;
  });

/**
 * Invite someone.
 *
 * Creating the row *is* the invitation: it exists before that person has an
 * auth account, and their first sign-in claims it by email. Nothing is emailed
 * from here — they use the ordinary sign-in form.
 */
export const inviteMember = ownerAction
  .metadata({ action: 'invited', entity: 'member' })
  .inputSchema(memberSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const email = input.email.toLowerCase();

      const [existing] = await tx
        .select()
        .from(members)
        .where(sql`lower(${members.email}) = ${email}`)
        .limit(1);

      if (existing) throw new ActionError('That email already has access.');

      const [member] = await tx
        .insert(members)
        .values({
          email,
          fullName: input.fullName,
          role: input.role,
          isPrincipal: input.isPrincipal,
        })
        .returning();

      if (!member) throw new ActionError('Could not create the invitation.');

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `invited ${input.role}`,
        entityType: 'member',
        entityId: member.id,
        entityLabel: input.fullName,
      });

      return { id: member.id, email, fullName: input.fullName };
    });

    updateTag(TAGS.members);
    return result;
  });

export const updateMember = ownerAction
  .metadata({ action: 'updated', entity: 'member' })
  .inputSchema(memberSchema.extend({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(members)
        .where(eq(members.id, input.id))
        .limit(1);

      if (!existing) throw new ActionError('That member no longer exists.');

      // Removing the last owner would lock everyone out of team management and
      // settings, with no way back in through the interface.
      if (existing.role === 'owner' && input.role !== 'owner') {
        const [row] = await tx
          .select({ count: sql<string>`COUNT(*)::text` })
          .from(members)
          .where(eq(members.role, 'owner'));
        if (Number(row?.count ?? 0) <= 1) {
          throw new ActionError('Nextly needs at least one owner.');
        }
      }

      await tx
        .update(members)
        .set({
          fullName: input.fullName,
          email: input.email.toLowerCase(),
          role: input.role,
          isPrincipal: input.isPrincipal,
        })
        .where(eq(members.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated member',
        entityType: 'member',
        entityId: input.id,
        entityLabel: input.fullName,
      });
    });

    updateTag(TAGS.members);
    return { fullName: input.fullName };
  });

export const removeMember = ownerAction
  .metadata({ action: 'removed', entity: 'member' })
  .inputSchema(z.object({ id: uuid }))
  .action(async ({ parsedInput: input, ctx }) => {
    const fullName = await db.transaction(async (tx) => {
      const [member] = await tx.select().from(members).where(eq(members.id, input.id)).limit(1);

      if (!member) throw new ActionError('That member no longer exists.');
      if (member.id === ctx.member.id) {
        throw new ActionError('You cannot remove your own access.');
      }
      if (member.isPrincipal) {
        throw new ActionError(
          'This person holds capital in the business. Change their role to read-only instead.',
        );
      }

      await tx.delete(members).where(eq(members.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'removed member',
        entityType: 'member',
        entityLabel: member.fullName,
      });

      return member.fullName;
    });

    updateTag(TAGS.members);
    return { fullName };
  });
