'use client';

import Image from 'next/image';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  children: React.ReactNode;
}

/**
 * ImagePreview — wraps a clickable image thumbnail. On click, opens a full-size
 * preview dialog matching the SolidJS `ImagePreview` component.
 */
export function ImagePreview({ src, alt = 'Image preview', children }: ImagePreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="cursor-zoom-in"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-black/95 border-none">
          <VisuallyHidden>
            <DialogTitle>{alt}</DialogTitle>
          </VisuallyHidden>
          <div className="relative h-[85vh] w-full">
            <Image
              src={src}
              alt={alt}
              fill
              unoptimized
              sizes="90vw"
              className="object-contain mx-auto rounded"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
