'use client';

import { upload } from '@vercel/blob/client';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMember } from '@/components/providers/member-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import {
  finalizeProductImageUpload,
  removeProductImage,
  reorderProductImages,
  setPrimaryProductImage,
} from '@/server/actions/media';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 10 * 1024 * 1024;

export type ProductImageValue = {
  id: string;
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  alt: string | null;
  isPrimary: boolean;
};

/**
 * Upload, reorder, set-primary and delete for one product's photos.
 *
 * Reorder is up/down buttons rather than drag-and-drop — the media pipeline
 * doc calls for a drag grid, and this is a deliberate narrower cut of it:
 * the same outcome (any ordering, reachable in a couple of clicks) without a
 * drag library or the accessibility work a custom drag surface needs to not
 * regress keyboard use. Revisit if reordering turns out to happen often
 * enough that two clicks feels slow.
 *
 * After `upload()` resolves, this always calls `finalizeProductImageUpload`
 * itself rather than waiting on the `onUploadCompleted` webhook — that
 * webhook is how the write happens in production, but it cannot reach a
 * machine behind NAT and so never fires on localhost. The action is
 * idempotent on the blob's pathname, so calling both is safe: whichever
 * runs first wins.
 */
export function ProductImages({
  productId,
  initial,
}: {
  productId: string;
  initial: ProductImageValue[];
}) {
  const router = useRouter();
  const { role } = useMember();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ key: string; name: string }[]>([]);
  const [removing, setRemoving] = useState<ProductImageValue | null>(null);

  const finalizeAction = useAction(finalizeProductImageUpload, {
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save the upload'),
  });
  const primaryAction = useAction(setPrimaryProductImage, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not set the primary image'),
  });
  const reorderAction = useAction(reorderProductImages, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not reorder'),
  });
  const removeAction = useAction(removeProductImage, {
    onSuccess: () => {
      toast.success('Image removed');
      setRemoving(null);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove the image'),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPEG, PNG, WebP or AVIF images are accepted`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: over the 10 MB limit`);
        continue;
      }

      setUploading((current) => [...current, { key, name: file.name }]);

      try {
        // putImage's response carries no dimensions of its own — read them
        // client-side and carry them through the token payload.
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;
        bitmap.close();

        const pathname = `products/${productId}/${crypto.randomUUID()}-${file.name}`;
        const blob = await upload(pathname, file, {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
          clientPayload: JSON.stringify({ productId, width, height }),
        });

        await finalizeAction.executeAsync({
          productId,
          url: blob.url,
          pathname: blob.pathname,
          width,
          height,
        });
        router.refresh();
      } catch (error) {
        toast.error(
          `${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`,
        );
      } finally {
        setUploading((current) => current.filter((item) => item.key !== key));
      }
    }
  }

  const canDelete = role === 'owner';

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="Photos"
        hint="First image is what shows on the catalog"
        action={
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-3.5" /> Add photos
            </Button>
          </>
        }
      />

      {initial.length === 0 && uploading.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-4">
          No photos yet. JPEG, PNG, WebP or AVIF, up to 10 MB each.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {initial.map((image, index) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-card border border-line-subtle bg-inset"
            >
              <div className="relative aspect-square">
                <Image
                  src={image.thumbUrl ?? image.url}
                  alt={image.alt ?? ''}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
                {image.isPrimary ? (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-control bg-accent px-1.5 py-0.5 text-[10px] text-accent-fg">
                    <Star className="size-2.5 fill-current" /> Primary
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1 border-line-subtle border-t bg-base/80 p-1">
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="Move earlier"
                    disabled={index === 0 || reorderAction.isPending}
                    onClick={() => {
                      const ids = initial.map((i) => i.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index] as string,
                        ids[index - 1] as string,
                      ];
                      reorderAction.execute({ productId, orderedIds: ids });
                    }}
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="Move later"
                    disabled={index === initial.length - 1 || reorderAction.isPending}
                    onClick={() => {
                      const ids = initial.map((i) => i.id);
                      [ids[index], ids[index + 1]] = [
                        ids[index + 1] as string,
                        ids[index] as string,
                      ];
                      reorderAction.execute({ productId, orderedIds: ids });
                    }}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                </div>
                <div className="flex items-center gap-0.5">
                  {!image.isPrimary ? (
                    <IconButton
                      label="Set as primary"
                      disabled={primaryAction.isPending}
                      onClick={() => primaryAction.execute({ id: image.id, productId })}
                    >
                      <Star className="size-3.5" />
                    </IconButton>
                  ) : null}
                  {canDelete ? (
                    <IconButton label="Delete" danger onClick={() => setRemoving(image)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {uploading.map((item) => (
            <div
              key={item.key}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border border-line-subtle border-dashed bg-inset text-ink-4"
            >
              <Loader2 className="size-5 animate-spin" />
              <span className="max-w-[80%] truncate px-2 text-center text-[10px]">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {removing ? (
        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Delete this photo?"
          description={
            removing.isPrimary
              ? 'This is the primary photo — the next one in order becomes primary in its place.'
              : 'This only removes the photo, not the product.'
          }
          confirmLabel="Delete photo"
          pending={removeAction.isPending}
          onConfirm={() => removeAction.execute({ id: removing.id })}
        />
      ) : null}

      {!canDelete && initial.length > 0 ? (
        <p className="flex items-center gap-1.5 border-line-subtle border-t px-4 py-2 text-[11px] text-ink-4">
          <AlertTriangle className="size-3" /> Only an owner can delete a photo.
        </p>
      ) : null}
    </Surface>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-6 place-items-center rounded-control text-ink-4 transition-colors',
        'hover:bg-hover disabled:pointer-events-none disabled:opacity-30',
        danger ? 'hover:text-negative' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
