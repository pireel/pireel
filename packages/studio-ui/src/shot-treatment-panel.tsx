'use client';

/**
 * Framing panel (auto-opens when a shot is selected): one SVG effect card per framing
 * type (person silhouette + image/text placeholder bars in a 9:16 mini-frame, isomorphic
 * to the real effect); click to apply — mirrors the person panel's style-card interaction.
 * What fills the freed-up empty area isn't handled here: just insert from the upload/gen panels.
 * Split/delete aren't here either: they live in the toolbar above the timeline (no duplicate entry).
 */

import { useEffect, useState } from 'react';
import type { ShotFilter, ShotTreatment, VideoShot } from '@pireel/studio-engine/composition';
import { SHOT_TREATMENTS, TREAT_SIZE_DEFAULT } from '@pireel/studio-engine/composition';
import { t } from './i18n';

/** One framing effect card: 1:1 frame filling the card, silhouette + image/text placeholder bars positioned by type (label sits below the card). */
function TreatmentPreview({ t }: { t: ShotTreatment }) {
  const bust = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="currentColor">
      <circle cx="0" cy="-8.5" r="6" />
      <path d="M-10 13 C-10 2 -5 -1 0 -1 C5 -1 10 2 10 13 Z" />
    </g>
  );
  const bars = (x: number, y: number, w: number) => (
    <g fill="var(--color-accent, #3f4be8)" opacity="0.5">
      <rect x={x} y={y} width={w} height="5" rx="2.5" />
      <rect x={x} y={y + 10} width={w * 0.68} height="5" rx="2.5" />
      <rect x={x} y={y + 20} width={w * 0.84} height="5" rx="2.5" />
    </g>
  );
  // Video area (light rounded rect)
  const vid = (x: number, y: number, w: number, h: number, r = 3) => <rect x={x} y={y} width={w} height={h} rx={r} className="fill-ink-4/25" />;
  let inner: React.ReactNode;
  switch (t) {
    case 'punch-in':
      // Punch-in: silhouette pushed to the top edge, cropped out of the frame
      inner = (
        <>
          {vid(2, 2, 92, 92)}
          {bust(48, 74, 5.2)}
        </>
      );
      break;
    case 'corner-br':
      inner = (
        <>
          {bars(10, 16, 44)}
          {vid(52, 52, 41, 41)}
          {bust(72.5, 80, 2.4)}
        </>
      );
      break;
    case 'corner-tl':
      inner = (
        <>
          {vid(3, 3, 41, 41)}
          {bust(23.5, 31, 2.4)}
          {bars(42, 62, 44)}
        </>
      );
      break;
    case 'split-l':
      inner = (
        <>
          {vid(2, 2, 45, 92)}
          {bust(24.5, 56, 3.2)}
          {bars(56, 38, 32)}
        </>
      );
      break;
    case 'split-r':
      inner = (
        <>
          {bars(8, 38, 32)}
          {vid(49, 2, 45, 92)}
          {bust(71.5, 56, 3.2)}
        </>
      );
      break;
    case 'split-t':
      inner = (
        <>
          {vid(2, 2, 92, 45)}
          {bust(48, 32, 3.2)}
          {bars(14, 60, 72)}
        </>
      );
      break;
    case 'split-b':
      inner = (
        <>
          {bars(14, 14, 72)}
          {vid(2, 51, 92, 45)}
          {bust(48, 81, 3.2)}
        </>
      );
      break;
    default:
      // None (no framing): empty frame + slash marker
      inner = <line x1="14" y1="82" x2="82" y2="14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />;
  }
  return (
    <svg viewBox="0 0 96 96" className="text-ink-3 w-full" aria-hidden>
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <clipPath id={`tp-${t}`}>
        <rect x="1.5" y="1.5" width="93" height="93" rx="4.5" />
      </clipPath>
      <g clipPath={`url(#tp-${t})`}>{inner}</g>
    </svg>
  );
}

const FILTER_FIELDS: { key: keyof ShotFilter; name: string }[] = [
  { key: 'brightness', name: 'panels.brightness' },
  { key: 'contrast', name: 'panels.contrast' },
  { key: 'saturate', name: 'panels.saturation' },
];

export function ShotTreatmentPanel({
  shot,
  onSetTreatment,
  onSetTreatSize,
  onPreviewTreatSize,
  onSetFilter,
  onPreviewFilter,
}: {
  shot: VideoShot;
  onSetTreatment: (shotId: string, t: ShotTreatment) => void;
  onSetTreatSize: (shotId: string, size: number) => void;
  /** Live preview while dragging (edits the iframe directly, zero setState); commits via onSetTreatSize on release. */
  onPreviewTreatSize: (shotId: string, size: number) => void;
  /** Commit per-shot grading (null = reset all); live preview via onPreviewFilter while dragging. */
  onSetFilter: (shotId: string, f: ShotFilter | null) => void;
  onPreviewFilter: (shotId: string, f: ShotFilter) => void;
}) {
  // Size slider: local value + live iframe preview while dragging (zero setState); commits to comp on release / after keyboard adjust
  const committedSize = shot.treatSize ?? TREAT_SIZE_DEFAULT[shot.treatment];
  const [dragSize, setDragSize] = useState<number | null>(null);
  useEffect(() => setDragSize(null), [shot.id, shot.treatment]);
  const sizeValue = dragSize ?? committedSize;
  const commitSize = () => {
    if (dragSize != null && dragSize !== committedSize) onSetTreatSize(shot.id, dragSize);
    setDragSize(null);
  };
  // Grading sliders (shown as percent, 100 = neutral): local value + live preview while dragging, commits on release
  const [dragFilter, setDragFilter] = useState<ShotFilter | null>(null);
  useEffect(() => setDragFilter(null), [shot.id]);
  const filterValue = dragFilter ?? shot.filter ?? {};
  const filterNeutral = FILTER_FIELDS.every(({ key }) => (filterValue[key] ?? 1) === 1);
  const commitFilter = () => {
    if (dragFilter) onSetFilter(shot.id, filterNeutral ? null : dragFilter);
    setDragFilter(null);
  };
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Title (framing · scene N)/close live in the floating-window header; only a one-line hint here */}
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.framingAppliesWholeShot')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        <div className="grid grid-cols-3 gap-2">
          {SHOT_TREATMENTS.map((tr) => {
            const active = shot.treatment === tr.id;
            return (
              <button
                key={tr.id}
                type="button"
                onClick={() => onSetTreatment(shot.id, tr.id)}
                aria-label={t('panels.framingName', { name: t(tr.name) })}
                className="group flex flex-col items-center gap-1"
              >
                <div className={`w-full rounded-lg border-2 transition ${active ? 'border-accent' : 'border-transparent group-hover:border-line-2'}`}>
                  <TreatmentPreview t={tr.id} />
                </div>
                <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-ink-3 group-hover:text-ink'}`}>{t(tr.name)}</span>
              </button>
            );
          })}
        </div>

        {/* Size (non-"none" types): punch-in = zoom amount, corner = inset size, split = video width share */}
        {shot.treatment !== 'full' && (
          <section className="flex flex-col gap-1.5">
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('panels.size')}</span>
              <span className="text-ink-4 tabular-nums">{Math.round(sizeValue)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sizeValue}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDragSize(v);
                onPreviewTreatSize(shot.id, v); // follow the finger: edit iframe directly, skip debounced rebuild
              }}
              onPointerUp={commitSize}
              onKeyUp={commitSize}
              onBlur={commitSize}
              className="zoom-range w-full"
              aria-label={t('panels.framingSize')}
            />
          </section>
        )}

        {/* Color grading (whole shot, switches at the cut): percent scale, 100 = original */}
        <section className="flex flex-col gap-1.5">
          <div className="text-ink flex items-center justify-between font-medium">
            <span>{t('panels.filters')}</span>
            {!filterNeutral && (
              <button type="button" className="text-ink-4 hover:text-ink text-[10.5px]" onClick={() => { setDragFilter(null); onSetFilter(shot.id, null); }}>
                {t('panels.reset')}
              </button>
            )}
          </div>
          {FILTER_FIELDS.map(({ key, name }) => {
            const v = Math.round((filterValue[key] ?? 1) * 100);
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-ink-3 w-7 shrink-0">{t(name)}</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={1}
                  value={v}
                  onChange={(e) => {
                    const next = { ...filterValue, [key]: Number(e.target.value) / 100 };
                    setDragFilter(next);
                    onPreviewFilter(shot.id, next); // follow the finger: edit iframe directly, skip debounced rebuild
                  }}
                  onPointerUp={commitFilter}
                  onKeyUp={commitFilter}
                  onBlur={commitFilter}
                  className="zoom-range w-full"
                  aria-label={t('panels.percentOfOriginal', { name: t(name) })}
                />
                <span className="text-ink-4 w-8 shrink-0 text-right tabular-nums">{v}</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
