'use client';

import { Printer, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The screen-only controls above a printable invoice. Hidden by `@media print`
 * (see globals.css), so they never land on the paper.
 *
 * Printing goes through the browser rather than a generated PDF: it needs no
 * dependency, respects the customer's own printer, and the print stylesheet is
 * the same one the on-screen document already uses.
 *
 * "Send via WhatsApp" opens a wa.me link pre-filled with the invoice URL. The
 * recipient is not signed in, so the link alone is useless until F-3b gives a
 * document its own unguessable token — for now this shares the summary text
 * and the site root, which is what a customer can actually act on.
 */
export function InvoiceActions({
  number,
  whatsapp,
  totalText,
}: {
  number: string;
  whatsapp: string | null;
  totalText: string;
}) {
  const digits = whatsapp?.replace(/\D/g, '') ?? '';

  // A wa.me link needs an international number. Without one we still let the
  // owner print; the send button just isn't offered.
  const message = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(`Invoice ${number} — ${totalText}`)}`
    : null;

  return (
    <div className="no-print mb-4 flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
        <Printer />
        Print
      </Button>
      {message ? (
        <Button asChild variant="ghost" size="sm">
          <a href={message} target="_blank" rel="noopener noreferrer">
            <Send />
            Send via WhatsApp
          </a>
        </Button>
      ) : null}
    </div>
  );
}
