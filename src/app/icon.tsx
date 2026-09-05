import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Root-scoped so both the dashboard and storefront tabs get a real icon
 * instead of the browser default — there was none at all before this.
 * Colours are the "Northlight" navy and bright cyan (`styles/tokens.css`'s
 * `.nx-store` block) copied as literal hex: Satori (the renderer behind
 * `ImageResponse`) can't read live CSS custom properties, so these must be
 * kept in sync by hand if that palette ever changes.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f202e',
        borderRadius: 7,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#37caec',
        }}
      />
    </div>,
    { ...size },
  );
}
