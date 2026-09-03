'use client';

/**
 * The last resort: a throw inside the root layout itself.
 *
 * This is the only boundary that replaces `<html>` and `<body>` entirely — a
 * throw here means `ThemeProvider` and the font providers in
 * `src/app/layout.tsx` never got to run, so this cannot lean on either. Kept
 * deliberately plain and inline-styled rather than importing Tailwind
 * classes or the design tokens: the whole point of this file is to render
 * something legible when everything above it has already failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#0b1017',
          color: '#e6edf3',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
            Nextly could not load this page
          </p>
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.6,
              color: '#9aa7b2',
            }}
          >
            Try again once. If it keeps happening, mention the error code
            {error.digest ? ` ${error.digest}` : ''} to support. The error has been logged.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              height: 32,
              padding: '0 14px',
              borderRadius: 6,
              border: '1px solid #37caec',
              background: '#37caec',
              color: '#04141a',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
