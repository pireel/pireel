'use client';

/** Small self-contained workbench UI bits: floating-toolbar corner-radius control, transport time readout,
 *  export dialog option rows, and the ][ bracket cut icon. */

import { memo, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Crown, Loader2, Squircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pireel/ui/tooltip';
import type { Block } from '@pireel/studio-engine/composition';
import { t } from './i18n';
import { usePlayheadT } from './playhead';
import { mediaDownloads } from './media-downloads';

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
            className={`rounded p-1 ${open ? 'text-ink bg-panel-2/35' : 'text-ink-3 hover:text-ink'}`}
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

/** Over the picture while footage of this project is still coming down to this device: the
 *  picture is blank because of that, and says so, with how far along it is once that is known. */
export function SourceDownloadNotice({ sigs }: { sigs: ReadonlySet<string> }) {
  // A figure only for a single download: several at once finish and start at different moments,
  // and one number for them would jump about.
  const percent = useSyncExternalStore(mediaDownloads.subscribe, () => {
    if (sigs.size !== 1) return -1;
    const [sig] = sigs;
    const fraction = mediaDownloads.get(sig!)?.fraction;
    return fraction != null ? Math.round(fraction * 100) : -1;
  }, () => -1);
  if (!sigs.size) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-[60] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-white">
      <Loader2 size={13} className="animate-spin" />
      {percent >= 0 ? t('workbench.srcDownloadingPct', { pct: percent }) : t('workbench.srcLoading')}
    </div>
  );
}

/** Fit to width: the timeline's two ends pushed out to the edges of the view. Same line weight as the cut brackets beside it. */
export function FitWidthIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 2.5 V11.5" />
      <path d="M12.5 2.5 V11.5" />
      <path d="M4 7 H10" />
      <path d="M5.8 5.2 L4 7 L5.8 8.8" />
      <path d="M8.2 5.2 L10 7 L8.2 8.8" />
    </svg>
  );
}

/** Renders what depends on where the playhead is: only this re-renders while it moves, and what
 *  it returns re-renders only when the answer changes (give it memoized children). */
export function AtPlayhead({ children }: { children: (seconds: number) => ReactNode }) {
  return <>{children(usePlayheadT())}</>;
}

/** Trim to the playhead, each side enabled only when there is something on that side to cut. */
export const TrimButtons = memo(function TrimButtons({ left, right, onTrim, leftLabel, rightLabel }: {
  left: boolean;
  right: boolean;
  onTrim: (side: 'left' | 'right') => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onTrim(side)}
              disabled={side === 'left' ? !left : !right}
              aria-label={side === 'left' ? leftLabel : rightLabel}
              className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
            >
              <BracketCutIcon dashed={side} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{side === 'left' ? leftLabel : rightLabel}</TooltipContent>
        </Tooltip>
      ))}
    </>
  );
});

/** Transport time readout: subscribes to the playhead store, so during playback only this small component re-renders each frame. */
export function TimeReadout({ duration }: { duration: number }) {
  const t = usePlayheadT();
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
      {t.toFixed(1)} / {duration.toFixed(1)}s
    </span>
  );
}

/** One option row in the export dialog: label + single-select chips. A `locked` option (above the
 *  account's plan) carries a crown and calls `onLocked` instead of being picked. */
export function ExportOptRow<T extends string | number>({
  label,
  value,
  options,
  onPick,
  locked,
  onLocked,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
  locked?: (v: T) => boolean;
  onLocked?: (v: T, text: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-ink-3 w-12 shrink-0 text-[12px]">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {options.map(([v, text]) => {
          const closed = !!locked?.(v);
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => (closed ? onLocked?.(v, text) : onPick(v))}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] ${v === value ? 'border-accent bg-accent/10 text-accent-ink' : 'border-line text-ink-3 hover:text-ink'}`}
            >
              {text}
              {closed && <Crown size={11} className="text-amber-500" aria-label={t('workbench.membershipFeature')} />}
            </button>
          );
        })}
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
