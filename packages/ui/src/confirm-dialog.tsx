'use client';

import { useEffect } from 'react';
import { Button } from './button';

interface Props {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' tints the confirm button red — use for destructive actions. */
  tone?: 'default' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Minimal confirm modal — single primary action plus cancel. Clicking the
 * backdrop or pressing Escape cancels. Focus trap is intentionally simple
 * (autofocus the confirm button) since the only interactive elements are
 * two buttons plus the backdrop.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'default',
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="border-line bg-panel min-w-[320px] max-w-[420px] rounded-lg border p-5 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-ink text-[15px] font-bold tracking-tight">{title}</div>
        {description && (
          <div className="text-ink-2 mt-2 text-[12.5px] leading-relaxed">{description}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={tone === 'danger' ? 'accent' : 'primary'}
            className={tone === 'danger' ? '!bg-rose !border-rose hover:brightness-110' : ''}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
