import { describe, expect, it } from 'vitest';
import { isApiPath, isDatabaseFreePath, isPublicPath } from '@/lib/route-access';

describe('route access policy', () => {
  it('keeps public pages and token documents public', () => {
    for (const pathname of [
      '/',
      '/login',
      '/auth/callback',
      '/auth/error',
      '/no-access',
      '/setup',
      '/design-system',
      '/robots.txt',
      '/sitemap.xml',
      '/icon',
      '/opengraph-image',
      '/p/camera',
      '/d/invoice/token',
      '/d/quote/token',
    ]) {
      expect(isPublicPath(pathname), pathname).toBe(true);
    }
  });

  it('does not make lookalike paths public', () => {
    for (const pathname of ['/login-help', '/setup-old', '/products', '/api/export']) {
      expect(isPublicPath(pathname), pathname).toBe(false);
    }
  });

  it('classifies every API path separately from page auth', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/export')).toBe(true);
    expect(isApiPath('/apiary')).toBe(false);
  });

  it('allows only database-free routes without database credentials', () => {
    for (const pathname of [
      '/login',
      '/auth/error',
      '/auth/callback',
      '/no-access',
      '/setup',
      '/design-system',
      '/robots.txt',
      '/sitemap.xml',
      '/icon',
      '/opengraph-image',
    ]) {
      expect(isDatabaseFreePath(pathname), pathname).toBe(true);
    }

    for (const pathname of [
      '/',
      '/p/camera',
      '/d/invoice/token',
      '/d/quote/token',
      '/dashboard',
    ]) {
      expect(isDatabaseFreePath(pathname), pathname).toBe(false);
    }
  });
});
