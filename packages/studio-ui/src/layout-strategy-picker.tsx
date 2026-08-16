'use client';

import { Check } from 'lucide-react';

export type LayoutStrategyPreviewId =
  | 'smart'
  | 'none'
  | 'zoom'
  | 'split-top-bottom'
  | 'split-left-right'
  | 'presenter-corner';

export type LayoutPositionId = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function LayoutStrategyOption({
  id,
  label,
  selected,
  onPick,
}: {
  id: LayoutStrategyPreviewId;
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onPick}
      className={`group relative w-full rounded-lg p-1.5 text-left transition-colors ${selected ? 'bg-panel-2' : 'hover:bg-panel-2/60'}`}
    >
      <span className="bg-canvas relative block aspect-video overflow-hidden rounded-md">
        <LayoutStrategyPreview id={id} />
      </span>
      <span className={`mt-1 block truncate text-center text-[10px] ${selected ? 'text-ink font-medium' : 'text-ink-3 group-hover:text-ink'}`}>{label}</span>
      {selected && (
        <span className="bg-accent text-accent-foreground absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full shadow-sm">
          <Check size={10} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

export function LayoutStrategyPreview({ id }: { id: LayoutStrategyPreviewId }) {
  const person = (x: number, y: number, scale: number) => (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="currentColor">
      <circle cx="0" cy="-7" r="5" />
      <path d="M-9 12C-9 3-4 0 0 0s9 3 9 12Z" />
    </g>
  );
  if (id === 'none' || id === 'zoom') {
    const zoomed = id === 'zoom';
    return (
      <svg viewBox="0 0 112 64" className="text-ink-3 h-full w-full" aria-hidden>
        <rect x="6" y="6" width="100" height="52" rx="5" className="fill-ink-4/15" />
        {person(56, zoomed ? 44 : 39, zoomed ? 2.55 : 1.55)}
        {!zoomed && <rect x="16" y="17" width="25" height="4" rx="2" className="fill-ink-4/30" />}
      </svg>
    );
  }
  if (id === 'split-top-bottom') {
    return (
      <svg viewBox="0 0 112 64" className="text-ink-3 h-full w-full" aria-hidden>
        <rect x="6" y="6" width="100" height="52" rx="5" className="fill-ink-4/15" />
        <rect x="6" y="32" width="100" height="26" rx="0" className="fill-accent/25" />
        {person(56, 25, 1)}
        <rect x="24" y="41" width="64" height="4" rx="2" className="fill-ink-3/45" />
        <rect x="34" y="49" width="44" height="3" rx="1.5" className="fill-ink-4/35" />
      </svg>
    );
  }
  if (id === 'split-left-right') {
    return (
      <svg viewBox="0 0 112 64" className="text-ink-3 h-full w-full" aria-hidden>
        <rect x="6" y="6" width="100" height="52" rx="5" className="fill-ink-4/15" />
        <rect x="56" y="6" width="50" height="52" rx="0" className="fill-accent/25" />
        {person(31, 39, 1.35)}
        <rect x="66" y="22" width="30" height="4" rx="2" className="fill-ink-3/45" />
        <rect x="70" y="31" width="22" height="3" rx="1.5" className="fill-ink-4/35" />
      </svg>
    );
  }
  if (id === 'presenter-corner') {
    return (
      <svg viewBox="0 0 112 64" className="text-ink-3 h-full w-full" aria-hidden>
        <rect x="6" y="6" width="100" height="52" rx="5" className="fill-accent/20" />
        <rect x="15" y="17" width="48" height="5" rx="2.5" className="fill-ink-3/45" />
        <rect x="15" y="27" width="34" height="4" rx="2" className="fill-ink-4/30" />
        <rect x="75" y="31" width="24" height="20" rx="4" className="fill-panel-2" />
        {person(87, 47, 0.75)}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 112 64" className="text-ink-3 h-full w-full" aria-hidden>
      <rect x="6" y="6" width="100" height="52" rx="5" className="fill-ink-4/15" />
      {person(72, 39, 1.65)}
      <rect x="16" y="18" width="34" height="5" rx="2.5" className="fill-ink-3/45" />
      <rect x="16" y="28" width="24" height="4" rx="2" className="fill-accent/55" />
    </svg>
  );
}

export function InlineLayoutPositionPicker({
  title,
  options,
  value,
  onPick,
}: {
  title: string;
  options: { id: LayoutPositionId; label: string }[];
  value: LayoutPositionId;
  onPick: (id: LayoutPositionId) => void;
}) {
  return (
    <div className="mt-2 rounded-lg bg-panel-2/45 p-2">
      <div className="text-ink-4 mb-1.5 text-[10px]">{title}</div>
      <div className={`grid gap-1.5 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              onClick={() => onPick(option.id)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] transition-colors ${selected ? 'bg-panel-2 text-ink font-medium' : 'text-ink-3 hover:bg-panel-2/70 hover:text-ink'}`}
            >
              <span className="border-line relative h-5 w-7 shrink-0 rounded border">
                <span className={`bg-accent absolute h-1.5 w-1.5 rounded-full ${positionDotClass(option.id)}`} />
              </span>
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function positionDotClass(position: LayoutPositionId): string {
  if (position === 'top') return 'left-1/2 top-1 -translate-x-1/2';
  if (position === 'bottom') return 'bottom-1 left-1/2 -translate-x-1/2';
  if (position === 'left') return 'left-1 top-1/2 -translate-y-1/2';
  if (position === 'right') return 'right-1 top-1/2 -translate-y-1/2';
  if (position === 'top-left') return 'left-1 top-1';
  if (position === 'top-right') return 'right-1 top-1';
  if (position === 'bottom-left') return 'bottom-1 left-1';
  return 'bottom-1 right-1';
}
