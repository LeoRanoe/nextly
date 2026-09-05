import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { whatsappLink } from '@/lib/whatsapp';

/**
 * The storefront's primary conversion action: open WhatsApp with a pre-filled
 * enquiry about one product. No cart, no checkout — for an over-the-counter
 * importer this is the channel customers already use (P0-10).
 *
 * A plain `<a>` rather than the shared `Button`: it renders inline inside
 * cards and stands alone on the product page without pulling in a heavier
 * shared component. On the catalog card it sits beside the card's own
 * "stretched link" (see `product-card.tsx`) as a sibling, never nested
 * inside it — HTML forbids an anchor inside another anchor, and nesting
 * them here previously caused a real hydration mismatch (the browser
 * silently un-nests invalid markup; React's virtual DOM doesn't).
 *
 * Renders nothing when the business has no valid WhatsApp number configured,
 * so we never show a dead link.
 */
export function WhatsAppCta({
  number,
  message,
  label = 'Ask on WhatsApp',
  size = 'md',
  className,
}: {
  number: string | null | undefined;
  message: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const href = whatsappLink(number, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} — opens WhatsApp`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap',
        'bg-[#25D366] text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]',
        'transition-[filter,translate] duration-150 ease-out-instrument hover:brightness-[0.94]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-4 text-[13px]',
        className,
      )}
    >
      <MessageCircle />
      {label}
    </a>
  );
}
