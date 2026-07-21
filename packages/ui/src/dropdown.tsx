'use client';

import { useEffect, useRef, useState } from 'react';

interface DropdownItem {
  key: string;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
}

/**
 * Minimal dropdown menu. The consumer supplies the trigger button as
 * `trigger`, and we attach the open/close behavior + item list. Closes on
 * outside click and Escape. No portal — renders inline, so put the trigger
 * in a container with enough z-index headroom.
 */
export function Dropdown({ trigger, items, align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={`border-line bg-panel shadow-[var(--shadow-lg)] absolute top-[calc(100%+4px)] z-40 min-w-[200px] overflow-hidden rounded-md border py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="hover:bg-panel-2 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[12.5px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-ink font-semibold">{it.label}</span>
              {it.description && (
                <span className="text-ink-4 text-[11px]">{it.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
