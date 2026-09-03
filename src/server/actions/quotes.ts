'use server';

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  convertQuoteRequestSchema,
  quoteCreateSchema,
  quoteRequestSchema,
  quoteRequestStatusSchema,
  quoteRequestUpdateSchema,
} from '@/lib/schemas';
import { db } from '../db/client';
import {
  customers,
  products,
  productVariants,
  quoteItems,
  quoteRequests,
  quotes,
  saleItems,
  sales,
  settings,
} from '../db/schema';
import { logActivity, nextDocumentNumber, type Tx } from '../services/posting';
import { rateForRecord } from '../services/rates';
import { ActionError, publicAction, writeAction } from './client';

async function lockQuoteRequest(tx: Tx, id: string) {
  await tx.execute(sql`SELECT id FROM quote_requests WHERE id = ${id} FOR UPDATE`);
  const [request] = await tx
    .select()
    .from(quoteRequests)
    .where(eq(quoteRequests.id, id))
    .limit(1);
  return request;
}

function quoteToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: createHash('sha256').update(raw).digest('hex') };
}

/** Turn a storefront request into an immutable customer-facing quote draft. */
export const createQuoteFromRequest = writeAction
  .metadata({ action: 'created', entity: 'quote' })
  .inputSchema(quoteCreateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const request = await lockQuoteRequest(tx, input.requestId);
      if (!request) throw new ActionError('That request no longer exists.');
      if (request.status === 'converted')
        throw new ActionError('That request already became a sale.');

      const [variant] = await tx
        .select({
          id: productVariants.id,
          name: productVariants.name,
          sku: productVariants.sku,
          productId: products.id,
          productName: products.name,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(productVariants.id, input.variantId), eq(products.status, 'active')))
        .limit(1);
      if (!variant) throw new ActionError('That product variant no longer exists.');
      if (request.productId && variant.productId !== request.productId)
        throw new ActionError('Choose a variant from the requested product.');

      const [settingsRow] = await tx
        .select({ days: sql<number>`quote_validity_days` })
        .from(settings)
        .limit(1);
      const validUntil = new Date(Date.now() + Number(settingsRow?.days ?? 14) * 86_400_000);
      const number = await nextDocumentNumber(tx, 'QT-');
      const token = quoteToken();
      const subtotalCents = input.unitPriceCents * request.quantity;
      const totalCents = subtotalCents - input.discountCents;
      if (totalCents < 0)
        throw new ActionError('The discount cannot exceed the quote subtotal.');

      const [quote] = await tx
        .insert(quotes)
        .values({
          number,
          customerName: request.name,
          customerContact: request.contact,
          requestId: request.id,
          currency: 'USD',
          subtotalCents,
          discountCents: input.discountCents,
          totalCents,
          validUntil,
          publicTokenHash: token.hash,
          notes: input.notes ?? request.details ?? null,
          createdById: ctx.member.id,
        })
        .returning({ id: quotes.id });
      if (!quote) throw new ActionError('Could not create the quote.');
      await tx.insert(quoteItems).values({
        quoteId: quote.id,
        productId: variant.productId,
        variantId: variant.id,
        productName: variant.productName,
        variantName: variant.name,
        sku: variant.sku,
        quantity: request.quantity,
        unitPriceCents: input.unitPriceCents,
        lineTotalCents: subtotalCents,
        position: 1,
      });
      await tx
        .update(quoteRequests)
        .set({ status: 'contacted', handledById: ctx.member.id })
        .where(eq(quoteRequests.id, request.id));
      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'created quote',
        entityType: 'quote',
        entityId: quote.id,
        entityLabel: number,
      });
      return { id: quote.id, number, token: token.raw };
    });
    return result;
  });

/**
 * Quote requests (F-5): the public half of demand capture.
 *
 * `createQuoteRequest` is deliberately NOT built on `writeAction` — a signed-out
 * visitor submits it from a storefront page. That makes it the one mutation in
 * the codebase allowed to run unauthenticated, so its guardrail is the schema:
 * required name and contact, capped free text, a quantity within sane bounds,
 * and a product id that must reference a real row (checked below) because a
 * foreign key alone would surface as a raw constraint error. Nothing here can
 * touch money; a request is a question.
 */

export const createQuoteRequest = publicAction
  .metadata({ action: 'created', entity: 'quote_request' })
  .inputSchema(quoteRequestSchema)
  .action(async ({ parsedInput: input }) => {
    if (input.productId) {
      const [variant] = await db
        .select({ id: productVariants.id })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.productId, input.productId),
            eq(productVariants.isActive, true),
            eq(products.status, 'active'),
            eq(products.catalogPublished, true),
          ),
        )
        .limit(1);
      if (!variant) throw new ActionError('That product is no longer listed.');
    }

    const [request] = await db
      .insert(quoteRequests)
      .values({
        name: input.name,
        contact: input.contact,
        productId: input.productId,
        quantity: input.quantity,
        details: input.details ?? null,
      })
      .returning({ id: quoteRequests.id });

    return { id: request?.id ?? '' };
  });

export const updateQuoteRequest = writeAction
  .metadata({ action: 'updated', entity: 'quote_request' })
  .inputSchema(quoteRequestUpdateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const request = await lockQuoteRequest(tx, input.id);

      if (!request) throw new ActionError('That request no longer exists.');
      if (request.status === 'converted') {
        throw new ActionError(
          'A converted request is kept as sales history and cannot be edited.',
        );
      }

      if (input.productId) {
        const [variant] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(
            and(
              eq(productVariants.productId, input.productId),
              eq(productVariants.isActive, true),
              eq(products.status, 'active'),
              eq(products.catalogPublished, true),
            ),
          )
          .limit(1);
        if (!variant) throw new ActionError('That product is no longer listed.');
      }

      await tx
        .update(quoteRequests)
        .set({
          name: input.name,
          contact: input.contact,
          productId: input.productId,
          quantity: input.quantity,
          details: input.details ?? null,
          handledById: ctx.member.id,
        })
        .where(eq(quoteRequests.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'updated quote request',
        entityType: 'quote_request',
        entityId: request.id,
        entityLabel: request.name,
      });

      return { name: input.name };
    });

    return result;
  });

export const setQuoteRequestStatus = writeAction
  .metadata({ action: 'updated', entity: 'quote_request' })
  .inputSchema(quoteRequestStatusSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const name = await db.transaction(async (tx) => {
      const request = await lockQuoteRequest(tx, input.id);

      if (!request) throw new ActionError('That request no longer exists.');
      // Conversion is not a status you click — it happens by making the draft
      // sale, which owns setting `converted` and `saleId` together.
      if (request.status === 'converted') {
        throw new ActionError('That request has already become a sale.');
      }

      await tx
        .update(quoteRequests)
        .set({ status: input.status, handledById: ctx.member.id })
        .where(eq(quoteRequests.id, input.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: `marked quote request ${input.status}`,
        entityType: 'quote_request',
        entityId: request.id,
        entityLabel: request.name,
      });

      return request.name;
    });

    return { name };
  });

/** Allocate the next customer code for the convert flow. Mirrors
 *  `nextCode` in actions/reference.ts — same series, so a converted quote
 *  cannot collide with a hand-created customer. */
async function nextCustomerCode(tx: Tx): Promise<string> {
  // Different quote requests can be converted concurrently. Serialize the
  // MAX+1 allocation so customer creation cannot collide.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('customers:K'))`);
  const rows = await tx.execute<{ next: string }>(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
      FROM customers
     WHERE code ~ '^K[0-9]+$'
  `);
  return `K${String(Number(rows[0]?.next ?? 1)).padStart(3, '0')}`;
}

export const convertQuoteRequestToSale = writeAction
  .metadata({ action: 'converted', entity: 'quote_request' })
  .inputSchema(convertQuoteRequestSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await db.transaction(async (tx) => {
      const request = await lockQuoteRequest(tx, input.id);

      if (!request) throw new ActionError('That request no longer exists.');
      if (request.status === 'converted') {
        throw new ActionError('That request has already become a sale.');
      }

      const [variant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(productVariants.id, input.variantId),
            eq(productVariants.isActive, true),
            sql`${products.status} <> 'archived'`,
            ...(request.productId ? [eq(productVariants.productId, request.productId)] : []),
          ),
        )
        .limit(1);
      if (!variant) throw new ActionError('That variant no longer exists.');

      const soldAt = new Date();
      const rateMicros = await rateForRecord(soldAt, tx);
      const number = await nextDocumentNumber(tx, 'V');

      // The requester becomes a customer so the sale has someone to bill and
      // the phone-or-email string lands in a field that is read by a person.
      const [customer] = await tx
        .insert(customers)
        .values({
          code: await nextCustomerCode(tx),
          name: request.name,
          phone: request.contact.includes('@') ? null : request.contact,
          email: request.contact.includes('@') ? request.contact : null,
          notes: `From quote request ${request.id}`,
        })
        .returning();
      if (!customer) throw new ActionError('Could not create the customer.');

      const lineTotalCents = input.unitPriceCents * request.quantity;

      const [sale] = await tx
        .insert(sales)
        .values({
          number,
          customerId: customer.id,
          status: 'draft',
          currency: 'USD',
          fxRateMicros: rateMicros,
          totalCents: lineTotalCents,
          totalUsdCents: lineTotalCents,
          paymentMethod: 'cash',
          soldAt,
          notes: request.details ? `Quote request: ${request.details}` : 'Quote request',
          createdById: ctx.member.id,
        })
        .returning();
      if (!sale) throw new ActionError('Could not create the sale.');

      await tx.insert(saleItems).values({
        saleId: sale.id,
        variantId: variant.id,
        quantity: request.quantity,
        unitPriceCents: input.unitPriceCents,
        unitPriceUsdCents: input.unitPriceCents,
        lineTotalUsdCents: lineTotalCents,
        position: 1,
      });

      await tx
        .update(quoteRequests)
        .set({ status: 'converted', saleId: sale.id, handledById: ctx.member.id })
        .where(eq(quoteRequests.id, request.id));

      await logActivity(tx, {
        memberId: ctx.member.id,
        action: 'converted quote request',
        entityType: 'quote_request',
        entityId: request.id,
        entityLabel: `${request.name} → ${number}`,
      });

      return { saleId: sale.id, number, customerName: customer.name };
    });

    return result;
  });
