import { ImageResponse } from 'next/og';

export const alt = 'Nextly — smart home devices in Paramaribo, Suriname';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Root-scoped, sharing `app/icon.tsx`'s reasoning: placing this file inside
 * `(store)/` instead (so only the public storefront pages would inherit it)
 * empirically failed to register as a route at all under this project's dev
 * server (Turbopack didn't discover a generated metadata file nested in a
 * route group — confirmed via the `.next` build trace: `/opengraph-image`
 * resolved with `page.tsx` present in the same folder, but 404'd the moment
 * the file moved one level down into `(store)/`). Root-scoped is also the
 * practically correct choice here regardless: the dashboard is noindex, so
 * it will never actually be crawled or shared, and every real share of this
 * domain — a WhatsApp link to `/` or `/p/[slug]` — is close to this shop's
 * entire conversion channel, so a broken or default link preview there is a
 * real, concrete loss, not cosmetic. Colours are the "Northlight" palette
 * (`styles/tokens.css`) as literal hex, for the same reason as
 * `app/icon.tsx`. Ships with a system fallback font; embedding the real
 * Instrument Sans typeface is a fast follow, not a blocker.
 */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 28,
        padding: '80px 96px',
        background: '#0f202e',
        color: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#5ac2f2',
          }}
        />
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, letterSpacing: -1 }}>
          Nextly
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 64,
          fontWeight: 600,
          letterSpacing: -2,
          lineHeight: 1.15,
        }}
      >
        <div style={{ display: 'flex' }}>Switch to smart.</div>
        <div style={{ display: 'flex' }}>Switch to Nextly.</div>
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>
        Smart home devices, imported and in stock in Paramaribo, Suriname.
      </div>
    </div>,
    { ...size },
  );
}
