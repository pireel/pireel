'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from './cn';
import { useUiI18n } from './i18n';

/**
 * Full-screen preview of one image, video or other piece of media. The caller renders the media and
 * any actions; this owns the dark backdrop, the close button, previous/next, Escape and focus.
 * A click on the backdrop closes it.
 */
export function MediaViewer({
  label,
  onClose,
  onPrevious,
  onNext,
  footer,
  className,
  children,
}: {
  /** Accessible name of the viewer, e.g. "Image preview". */
  label: string;
  onClose: () => void;
  /** Shown as the left arrow (and bound to ←) when there is an earlier item. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Caption and actions under the media. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const ui = useUiI18n();
  const closeOnBackdrop = (event: React.MouseEvent) => { if (event.target === event.currentTarget) onClose(); };
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/85" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' && onPrevious) { event.preventDefault(); onPrevious(); }
            else if (event.key === 'ArrowRight' && onNext) { event.preventDefault(); onNext(); }
          }}
          onClick={closeOnBackdrop}
          className={cn('fixed inset-0 z-[100] flex flex-col outline-none', className)}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <div className="flex shrink-0 justify-end p-3" onClick={closeOnBackdrop}>
            <DialogPrimitive.Close aria-label={ui.close} className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white">
              <XIcon size={20} />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-16" onClick={closeOnBackdrop}>
            {children}
            {onPrevious && (
              <button type="button" onClick={onPrevious} aria-label={ui.previous} className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <ChevronLeft size={22} />
              </button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} aria-label={ui.next} className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <ChevronRight size={22} />
              </button>
            )}
          </div>
          <div className="mx-auto flex min-h-14 w-full max-w-3xl shrink-0 items-center justify-center gap-3 px-6 py-4 text-sm text-white/80" onClick={closeOnBackdrop}>
            {footer}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A quiet button for the viewer's footer. */
export const mediaViewerAction = 'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20';
