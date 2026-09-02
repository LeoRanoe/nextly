import { describe, expect, it } from 'vitest';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';

describe('whatsappDigits', () => {
  it('keeps only the international digits', () => {
    expect(whatsappDigits('+597 84-12-34')).toBe('597841234');
    expect(whatsappDigits('(597) 841-2345')).toBe('5978412345');
  });

  it('returns null when there is no usable number', () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
    expect(whatsappDigits('')).toBeNull();
    expect(whatsappDigits('abc')).toBeNull();
    // Too short to be a real subscriber number.
    expect(whatsappDigits('12345')).toBeNull();
  });
});

describe('whatsappLink', () => {
  it('builds a wa.me link with an encoded message', () => {
    const href = whatsappLink('+597 84-12-34', 'Hallo Nextly, SKU A-1');
    expect(href).toBe('https://wa.me/597841234?text=Hallo%20Nextly%2C%20SKU%20A-1');
  });

  it('returns null without a valid number so callers hide the CTA', () => {
    expect(whatsappLink(null, 'anything')).toBeNull();
    expect(whatsappLink('   ', 'anything')).toBeNull();
  });
});
