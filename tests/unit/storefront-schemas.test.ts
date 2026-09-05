import { describe, expect, it } from 'vitest';
import { compatibilitySchema, restockRequestSchema } from '@/lib/schemas';

describe('storefront schemas', () => {
  it('keeps compatibility groups distinct and extensible', () => {
    const value = compatibilitySchema.parse({ platforms: ['Amazon Alexa'], protocols: ['Matter'], ecosystems: ['Home Assistant'] });
    expect(value).toEqual({ platforms: ['Amazon Alexa'], protocols: ['Matter'], ecosystems: ['Home Assistant'] });
  });
  it('rejects malformed restock interest before it reaches the database', () => {
    expect(() => restockRequestSchema.parse({ productId: 'not-a-uuid', variantId: null, contact: '', channel: 'email' })).toThrow();
  });
});
