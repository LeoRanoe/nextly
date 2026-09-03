'use client';

import { Copy, ExternalLink, Printer, Send } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createPublicInvoiceLink } from '@/server/actions/invoices';

/**
 * The screen-only controls above a printable invoice. Hidden by `@media print`
 * (see globals.css), so they never land on the paper.
 *
 * Printing goes through the browser rather than a generated PDF: it needs no
 * dependency, respects the customer's own printer, and the print stylesheet is
 * the same one the on-screen document already uses.
 *
 * A link is created server-side with a revocable, unguessable token. The
 * customer never receives the authenticated invoice route or an invoice id.
 */
export function InvoiceActions({
  saleId,
  number,
  whatsapp,
  totalText,
}: {
  saleId: string;
  number: string;
  whatsapp: string | null;
  totalText: string;
}) {
  const digits = whatsapp?.replace(/\D/g, '') ?? '';
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const share = useAction(createPublicInvoiceLink, {
    onSuccess: async ({ data }) => {
      if (!data) return;
      setPublicUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success('Secure invoice link copied');
      } catch {
        toast.success('Secure invoice link created');
      }
      if (digits) {
        const message = `https://wa.me/${digits}?text=${encodeURIComponent(
          `Invoice ${number} — ${totalText}\n${data.url}`,
        )}`;
        window.open(message, '_blank', 'noopener,noreferrer');
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create invoice link'),
  });

  return (
    <div className="no-print mb-4 flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer />
        Print
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => share.execute({ saleId })}
        disabled={share.status === 'executing'}
      >
        <Copy /> {share.status === 'executing' ? 'Creating link…' : 'Create share link'}
      </Button>
      {publicUrl ? (
        <>
          <Button asChild variant="ghost" size="sm">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open public invoice
            </a>
          </Button>
          {digits ? (
            <Send className="size-4 text-positive" aria-label="WhatsApp link ready" />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
