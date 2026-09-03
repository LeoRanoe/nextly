'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { updateQuoteRequest } from '@/server/actions/quotes';
import type { QuoteProductOption } from '@/server/queries/quotes';

export type QuoteRequestValues = {
  id: string;
  name: string;
  contact: string;
  productId: string | null;
  quantity: number;
  details: string | null;
};

export function QuoteRequestSheet({
  initial,
  products,
  open,
  onOpenChange,
}: {
  initial: QuoteRequestValues;
  products: QuoteProductOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState(initial.name);
  const [contact, setContact] = useState(initial.contact);
  const [productId, setProductId] = useState(initial.productId ?? '');
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [details, setDetails] = useState(initial.details ?? '');

  const update = useAction(updateQuoteRequest, {
    onSuccess({ data }) {
      toast.success(`${data?.name} updated`);
      onOpenChange(false);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update the request'),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit quote request"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton form={formId} pending={update.isPending}>
            Save changes
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          update.execute({
            id: initial.id,
            name,
            contact,
            productId: productId || null,
            quantity,
            details: details || undefined,
          });
        }}
      >
        <SheetSection title="Request">
          <Field label="Name" htmlFor={`${formId}-name`} required>
            <Input
              id={`${formId}-name`}
              value={name}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Phone or email" htmlFor={`${formId}-contact`} required>
            <Input
              id={`${formId}-contact`}
              value={contact}
              required
              onChange={(event) => setContact(event.target.value)}
            />
          </Field>
          <Field label="Product" htmlFor={`${formId}-product`} hint="Optional">
            <Select
              id={`${formId}-product`}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="">No product specified</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" htmlFor={`${formId}-quantity`} required>
            <Input
              id={`${formId}-quantity`}
              type="number"
              min={1}
              max={9999}
              value={quantity}
              required
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Details" htmlFor={`${formId}-details`} hint="Optional">
            <Textarea
              id={`${formId}-details`}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </Field>
        </SheetSection>
      </form>
    </Sheet>
  );
}
