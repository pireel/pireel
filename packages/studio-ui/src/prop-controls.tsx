'use client';

/**
 * The inspector's control set, shared by every property row (registered and bespoke components,
 * block placement and timing). One visual language: quiet filled fields with no outline until
 * focus, neutral selection (never the accent — the accent belongs to the content being edited),
 * hairline sliders, and colours folded into one row that opens a swatch popover.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Text / number field: a soft fill, no outline at rest; focus draws a hairline. */
export const PROP_INPUT =
  'bg-panel hover:bg-panel-2/70 focus:bg-canvas text-ink placeholder:text-ink-4 w-full rounded-md px-2.5 py-1.5 text-[12px] leading-5 outline-none transition-[background-color,box-shadow] focus:shadow-[inset_0_0_0_1px_var(--color-line-2)]';

/** Selected / resting look for option tiles and segments: neutral, like a pressed key. */
export const OPTION_ON = 'bg-canvas text-ink font-medium shadow-[0_0_0_1px_var(--color-line-2),0_1px_2px_rgb(0_0_0/0.06)]';
export const OPTION_OFF = 'text-ink-3 hover:text-ink';

/** Label left, control right — the compact editor row. */
export function PropRow({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[28px] items-center gap-3" title={title}>
      <span className="text-ink-3 min-w-0 flex-1 truncate text-[11.5px]">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Hairline slider with its value; `onLive` paints while dragging, `onCommit` persists on release. */
export function PropSlider({
  label,
  title,
  value,
  min,
  max,
  step,
  display,
  onLive,
  onCommit,
}: {
  label: string;
  title?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onLive?: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  return (
    <PropRow label={label} title={title}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => (onLive ?? onCommit)(Number(e.target.value))}
        onPointerUp={(e) => onLive && onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onLive && onCommit(Number((e.target as HTMLInputElement).value))}
        className="prop-range w-28"
      />
      <span className="text-ink-3 w-10 text-right text-[11px] tabular-nums">{display}</span>
    </PropRow>
  );
}

/** Palettes by what the colour is for: an accent wants saturated hues, text wants contrast;
 *  panels keep the host's muted surface set. */
export const ACCENT_SWATCHES: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Coral', value: '#FF5A36' }, { name: 'Rose', value: '#F43F6B' }, { name: 'Amber', value: '#FFB020' },
  { name: 'Lime', value: '#9BD631' }, { name: 'Green', value: '#1FB866' }, { name: 'Teal', value: '#12B5A5' },
  { name: 'Sky', value: '#2E9BF0' }, { name: 'Blue', value: '#3B5BFD' }, { name: 'Violet', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' }, { name: 'Ink', value: '#161616' }, { name: 'White', value: '#FFFFFF' },
];
export const INK_SWATCHES: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'White', value: '#FFFFFF' }, { name: 'Paper', value: '#F5F1E8' }, { name: 'Silver', value: '#C9CCD1' },
  { name: 'Slate', value: '#5B6069' }, { name: 'Ink', value: '#161616' }, { name: 'Yellow', value: '#FFD84D' },
  { name: 'Coral', value: '#FF5A36' }, { name: 'Sky', value: '#2E9BF0' },
];

const SWATCH = 'h-5 w-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(127,127,127,0.28)]';
const NONE_SWATCH = `${SWATCH} bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)]`;

/**
 * One colour property in one row: the current colour and its value on the right; the swatches,
 * the custom picker and (optionally) opacity open in a popover under it.
 */
export function ColorControl({
  label,
  title,
  value,
  swatches,
  resetLabel,
  isReset,
  onReset,
  onPick,
  alpha,
}: {
  label: string;
  title?: string;
  /** #rrggbb shown on the chip; empty when following the theme / unset. */
  value: string;
  swatches: ReadonlyArray<{ name: string; value: string }>;
  /** What the empty choice means ("Follow theme", "None", "Reset"). */
  resetLabel: string;
  isReset: boolean;
  onReset: () => void;
  onPick: (hex: string) => void;
  /** Opacity for a concrete colour, 10–100. */
  alpha?: { value: number; label: string; onChange: (next: number) => void };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const hex = /^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : '';
  const ring = 'ring-ink-3 ring-2 ring-offset-2 ring-offset-canvas';
  return (
    <div ref={rootRef} className="relative" title={title}>
      <PropRow label={label}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="bg-panel hover:bg-panel-2/70 flex h-7 min-w-[112px] items-center gap-2 rounded-md pl-1.5 pr-2.5 text-[11.5px] transition-colors"
        >
          {/* A concrete colour always shows itself (a bespoke default is a real colour); only an
              empty value — following the theme, or none — reads as the reset choice. */}
          {!hex ? <span className={NONE_SWATCH} /> : <span className={SWATCH} style={{ background: value }} />}
          <span className={`truncate tabular-nums ${!hex ? 'text-ink-3' : 'text-ink uppercase'}`}>
            {!hex ? resetLabel : hex}
          </span>
        </button>
      </PropRow>
      {open && (
        <div className="bg-canvas absolute right-0 top-full z-30 mt-1 w-[212px] rounded-lg p-2.5 shadow-[0_0_0_1px_var(--color-line-2),0_12px_32px_rgb(0_0_0/0.14)]">
          <div className="grid grid-cols-7 gap-1.5">
            <button type="button" onClick={onReset} title={resetLabel} aria-label={resetLabel} className={`${NONE_SWATCH} ${isReset ? ring : ''}`} />
            {swatches.map((sw) => (
              <button
                key={sw.value}
                type="button"
                title={sw.name}
                aria-label={sw.name}
                onClick={() => onPick(sw.value)}
                className={`${SWATCH} transition-transform hover:scale-110 ${hex.toLowerCase() === sw.value.toLowerCase() ? ring : ''}`}
                style={{ background: sw.value }}
              />
            ))}
          </div>
          <label className="bg-panel hover:bg-panel-2/70 mt-2.5 flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-[11.5px]">
            <span className={`${SWATCH} h-4 w-4 bg-[conic-gradient(#ff6b5f,#ffd24d,#37d6b0,#4d7cfe,#b89cff,#ff6b5f)]`} />
            <span className="text-ink-2 flex-1">{hex ? hex.toUpperCase() : '#FFFFFF'}</span>
            <input type="color" value={hex || '#ffffff'} onChange={(e) => onPick(e.target.value)} className="sr-only" />
          </label>
          {alpha && hex ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-ink-3 shrink-0 text-[10.5px]">{alpha.label}</span>
              <input type="range" min={10} max={100} step={5} value={alpha.value} onChange={(e) => alpha.onChange(Number(e.target.value))} className="prop-range min-w-0 flex-1" />
              <span className="text-ink-3 w-8 text-right text-[10.5px] tabular-nums">{alpha.value}%</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
