# Media pipeline (Vercel Blob)

Product images and expense receipts.

Status: **schema and configuration are in place; the upload UI is not built yet.**
This document is the design it will be built to, and the two constraints below
are the reason it is shaped this way.

---

## Two constraints that shape everything

Both were verified against the `@vercel/blob` documentation rather than assumed.

### 1. `putImage()` requires OIDC credentials

`putImage()` optimises an image at write time and stores only the optimised
output. It **rejects a read-write token** — it needs the OIDC credentials Vercel
injects into functions automatically.

- On Vercel: works.
- Locally: needs `vercel env pull`, which fetches an OIDC token.

### 2. `onUploadCompleted` never fires on localhost

The client-upload webhook cannot reach a machine behind NAT. Vercel calls it
after the upload finishes and retries up to five times if the route does not
return 200.

Consequently a dev-only fallback runs the same derivative step inline after
upload, so local development is not blocked and does not require a tunnel.
The production path stays the webhook.

---

## The flow

```
browser                    /api/blob/upload              blob store
   │                              │                           │
   │  upload() from               │                           │
   │  @vercel/blob/client         │                           │
   ├─────────────────────────────►│ handleUpload              │
   │                              │  onBeforeGenerateToken:   │
   │                              │   • check session         │
   │                              │   • allowedContentTypes   │
   │                              │   • maximumSizeInBytes    │
   │◄─────────────────────────────┤ signed token              │
   │                                                          │
   ├─────────────────────────────────────────────────────────►│ original
   │                                                          │
   │                              │◄──────────────────────────┤ webhook
   │                              │ onUploadCompleted:        │
   │                              │  putImage(url, 1600 AVIF) │
   │                              │  putImage(url,  400 WebP) │
   │                              │  insert product_images    │
   │                              │  del(original)            │
```

**Client upload, not a Server Action.** A Server Action body is capped at 4.5 MB
on Vercel, and a photo from a phone routinely exceeds that. Client upload sends
the file straight to the blob store and never through a function.

**`putImage` accepts a `URL`.** The derivative step passes
`new URL(blob.url)` and Vercel fetches it server-side, so the original never has
to be downloaded into the function.

**The original is deleted.** Only the two derivatives are kept. Storing the
original as well would roughly triple the bill for a file nobody ever serves.

## Deriving

| Purpose | Width | Format | Quality |
|---|---|---|---|
| Product display | 1600 | AVIF | 75 |
| Grid thumbnail | 400 | WebP | 75 |

`putImage` returns the source unchanged if the optimised output would be
larger, so check `contentType` in the response before assuming a conversion
happened.

Both URLs, plus intrinsic width and height and a blur placeholder, are stored on
`product_images`. Dimensions matter: `next/image` uses them to reserve space, and
without them every product grid shifts as it loads.

## Deleting

`blob_pathname` and `thumb_pathname` are stored precisely so a deleted row can
delete its blobs. Without them the store accumulates orphans that nothing
references and nobody can identify — and Vercel bills for them indefinitely.

Deleting a `product_images` row must call `del()` on both pathnames.

## Configuration

`next.config.ts`:

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
  ],
  formats: ['image/avif', 'image/webp'],
}
```

`images.domains` is deprecated in Next 16; `remotePatterns` is the replacement
and is stricter about what it matches.

## Guards

`onBeforeGenerateToken` is the only place upload is authorised, and it must:

- confirm a signed-in member (`requireWrite`);
- pin `allowedContentTypes` to `['image/jpeg', 'image/png', 'image/webp', 'image/avif']`;
- pin `maximumSizeInBytes` (10 MB is generous for a product photo);
- put the product id in `tokenPayload`, so `onUploadCompleted` knows which row
  to write without trusting anything the client sends back.

The webhook is called by Vercel, not by the user, and must be idempotent: it
retries up to five times, and inserting the same image five times is a worse
failure than not inserting it at all.

## The UI it feeds

Drag-and-drop grid with reorder, set-primary, inline alt text, per-file
progress, replace and delete. Alt text is a first-class field, not an
afterthought — it is what the catalog will need for accessibility and search.
