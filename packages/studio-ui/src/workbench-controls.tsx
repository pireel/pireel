'use client';

/** Small self-contained workbench UI bits: floating-toolbar corner-radius control, transport time readout,
 *  export dialog option rows, and the ][ bracket cut icon. */

import { useEffect, useRef, useState } from 'react';
import { Squircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pireel/ui/tooltip';
import type { Block } from '@pireel/studio-engine/composition';
import { t } from './i18n';
import { usePlayheadT } from './playhead';

/** "Corner radius" control on the floating toolbar (shared by layout blocks / media cards). Rotation uses the bottom rotate handle, not here.
 *  Live slider: onRadius previews while dragging (parent directly sets iframe border-radius), commits to Block on release. */
export function CardShapeControls({ block, onRadius }: { block: Block; onRadius: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const radius = Math.round(block.radius ?? 0);
  return (
    <span ref={ref} className="relative inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={t('workbench.cornerRadius')}
            className={`rounded p-1 ${open ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
          >
            <Squircle size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('workbench.cornerRadius')}</TooltipContent>
      </Tooltip>
      {open && (
        <div className="border-line bg-panel absolute left-1/2 top-full z-50 mt-1.5 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-2.5 py-2 shadow-xl">
          <span className="text-ink-4 w-8 shrink-0 text-[10px]">{t('workbench.cornerRadius')}</span>
          <input type="range" min={0} max={120} step={2} value={radius} onChange={(e) => onRadius(Number(e.target.value))} className="zoom-range w-32" aria-label={t('workbench.cornerRadius')} />
          <span className="text-ink-3 w-9 shrink-0 text-right font-mono text-[10px] tabular-nums">{radius}px</span>
        </div>
      )}
    </span>
  );
}

/** Transport time readout: subscribes to the playhead store, so during playback only this small component re-renders each frame. */
export function TimeReadout({ duration }: { duration: number }) {
  const t = usePlayheadT();
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
      {t.toFixed(1)} / {duration.toFixed(1)}s
    </span>
  );
}

/** One option row in the export dialog: label + single-select chips. */
export function ExportOptRow<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-ink-3 w-12 shrink-0 text-[12px]">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onPick(v)}
            className={`rounded-md border px-2.5 py-1 text-[12px] ${v === value ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-3 hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Edit icon ][: two bracket halves flank the playhead; dashed specifies which half is dashed = the side being trimmed (split isn't dashed).
 *  The dashed half is drawn as three separate strokes: a single stroke would let the lower arm's dash phase continue from the vertical line, making the arms asymmetric. */
export function BracketCutIcon({ dashed }: { dashed?: 'left' | 'right' }) {
  // outer = the arm's outer-end x, bar = the vertical line x. Arms are all drawn from the outer end toward the vertical line, so the phase is consistent; the 9px vertical line divides evenly by the 1.8 period, keeping both ends symmetric
  const half = (outer: number, bar: number, isDashed: boolean) =>
    isDashed ? (
      <g strokeDasharray="1.8 1.8">
        <path d={`M${outer} 2.5 H${bar}`} />
        <path d={`M${bar} 2.5 V11.5`} />
        <path d={`M${outer} 11.5 H${bar}`} />
      </g>
    ) : (
      <path d={`M${outer} 2.5 H${bar} V11.5 H${outer}`} />
    );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {half(2.5, 5.5, dashed === 'left')}
      {half(11.5, 8.5, dashed === 'right')}
    </svg>
  );
}
