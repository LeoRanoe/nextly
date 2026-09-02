/**
 * WhatsApp deep links.
 *
 * Both the storefront enquiry CTA (P0-10) and the invoice "send" action build
 * a `wa.me` URL from the business number stored in settings. Centralised here
 * so the digit-stripping and encoding are done once rather than diverging per
 * call site.
 */

/** International digits only — `wa.me` rejects anything else. Returns null when
 *  no usable number is configured, so callers can hide the CTA rather than emit
 *  a dead link. */
export function whatsappDigits(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/\D/g, '') ?? '';
  return digits.length >= 6 ? digits : null;
}

/** A `wa.me` link pre-filled with `text`. Null when there is no valid number. */
export function whatsappLink(raw: string | null | undefined, text: string): string | null {
  const digits = whatsappDigits(raw);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
