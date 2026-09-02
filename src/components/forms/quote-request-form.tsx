'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { createQuoteRequest } from '@/server/actions/quotes';
import type { QuoteProductOption } from '@/server/queries/quotes';

/**
 * The storefront's quote-request form (F-5).
 *
 * Shown collapsed under a product's WhatsApp CTA — the primary channel stays
 * first (P0-10) — for visitors who would rather type an enquiry than open a
 * chat app. Submits to `createQuoteRequest`, the one unauthenticated action;
 * everything required is two fields, so the form asks for nothing a WhatsApp
 * message wouldn't.
 */
export function QuoteRequestForm({
  productId,
  productName,
  products,
}: {
  /** Set when the form belongs to one product: the item picker disappears and
   *  the request is filed against this product. */
  productId?: string;
  productName?: string;
  /** Only used when `productId` is absent — the catalog-wide form picks its
   *  own item from the published catalog. */
  products?: QuoteProductOption[];
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [picked, setPicked] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  const { execute, isPending } = useAction(createQuoteRequest, {
    onSuccess: () => setSent(true),
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not send the request', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });

  if (sent) {
    return (
      <div className="rounded-card border border-line-subtle bg-raised p-6 text-center sm:p-8">
        <p className="flex items-center justify-center gap-2 font-medium text-[14px] text-ink">
          <Check className="size-4 text-positive" aria-hidden="true" />
          Request received
        </p>
        <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed">
          We have your details and will reply with a price as soon as we can.
        </p>
        <Link
          href="/"
          className="mt-3 inline-block text-[13px] text-accent underline-offset-4 hover:underline"
        >
          Continue browsing
        </Link>
      </div>
    );
  }

  const showPicker = !productId && products && products.length > 0;

  return (
    <form
      className="space-y-4 rounded-card border border-line-subtle bg-raised p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number.parseInt(quantity, 10);
        execute({
          name: name.trim(),
          contact: contact.trim(),
          productId: productId ?? (picked || null),
          quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
          details: details.trim() || undefined,
        });
      }}
    >
      <FieldRow>
        <Field label="Your name" htmlFor="quote-name" required>
          <Input
            id="quote-name"
            required
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How should we address you?"
          />
        </Field>
        <Field label="Phone or email" htmlFor="quote-contact" required hint="We reply here">
          <Input
            id="quote-contact"
            required
            maxLength={200}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="WhatsApp number or email"
          />
        </Field>
      </FieldRow>

      <FieldRow>
        {showPicker ? (
          <Field label="Item" htmlFor="quote-product">
            <Select
              id="quote-product"
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
            >
              <option value="">Something else / not sure</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Item" htmlFor="quote-item">
            <Input
              id="quote-item"
              readOnly
              value={productName ?? ''}
              className="cursor-default text-ink-3"
              tabIndex={-1}
            />
          </Field>
        )}
        <Field label="Quantity" htmlFor="quote-quantity">
          <Input
            id="quote-quantity"
            type="number"
            min={1}
            max={9999}
            step={1}
            inputMode="numeric"
            numeric
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
      </FieldRow>

      <Field label="What do you need?" htmlFor="quote-details">
        <Textarea
          id="quote-details"
          rows={4}
          maxLength={2000}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Colour, storage, delivery day…"
        />
      </Field>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] text-ink-4">Prices are confirmed by phone or email.</p>
        <Button type="submit" variant="primary" size="lg" disabled={isPending}>
          {isPending ? 'Sending…' : 'Request a quote'}
        </Button>
      </div>
    </form>
  );
}
