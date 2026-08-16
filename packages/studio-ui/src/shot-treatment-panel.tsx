'use client';

/**
 * Framing panel: intent-level layout cards map directly onto the existing ShotTreatment values.
 * Split and corner directions are an inline secondary choice, matching the custom-frame UI.
 * What fills the freed-up empty area isn't handled here: just insert from the upload/gen panels.
 * Split/delete aren't here either: they live in the toolbar above the timeline (no duplicate entry).
 */

import { useEffect, useState } from 'react';
import type { ShotFilter, ShotTreatment, VideoShot } from '@pireel/studio-engine/composition';
import { TREAT_SIZE_DEFAULT } from '@pireel/studio-engine/composition';
import { AudioLevel } from './audio-level';
import { t } from './i18n';
import {
  InlineLayoutPositionPicker,
  LayoutStrategyOption,
  type LayoutPositionId,
  type LayoutStrategyPreviewId,
} from './layout-strategy-picker';

type FramingLayoutId = Exclude<LayoutStrategyPreviewId, 'smart'>;

const FRAMING_LAYOUTS: { id: FramingLayoutId; label: string }[] = [
  { id: 'none', label: 'common.none' },
  { id: 'zoom', label: 'common.zoomIn' },
  { id: 'split-top-bottom', label: 'customFrame.layout.splitTopBottom' },
  { id: 'split-left-right', label: 'customFrame.layout.splitLeftRight' },
  { id: 'presenter-corner', label: 'customFrame.layout.presenterCorner' },
];

const FRAMING_POSITIONS: Record<Exclude<FramingLayoutId, 'none' | 'zoom'>, { id: LayoutPositionId; label: string; treatment: ShotTreatment }[]> = {
  'split-top-bottom': [
    { id: 'top', label: 'customFrame.position.top', treatment: 'split-t' },
    { id: 'bottom', label: 'customFrame.position.bottom', treatment: 'split-b' },
  ],
  'split-left-right': [
    { id: 'left', label: 'customFrame.position.left', treatment: 'split-l' },
    { id: 'right', label: 'customFrame.position.right', treatment: 'split-r' },
  ],
  'presenter-corner': [
    { id: 'top-left', label: 'customFrame.corner.topLeft', treatment: 'corner-tl' },
    { id: 'top-right', label: 'customFrame.corner.topRight', treatment: 'corner-tr' },
    { id: 'bottom-left', label: 'customFrame.corner.bottomLeft', treatment: 'corner-bl' },
    { id: 'bottom-right', label: 'customFrame.corner.bottomRight', treatment: 'corner-br' },
  ],
};

export function framingLayout(treatment: ShotTreatment): FramingLayoutId {
  if (treatment === 'full') return 'none';
  if (treatment === 'punch-in') return 'zoom';
  if (treatment === 'split-t' || treatment === 'split-b') return 'split-top-bottom';
  if (treatment === 'split-l' || treatment === 'split-r') return 'split-left-right';
  return 'presenter-corner';
}

export function treatmentForLayout(layout: FramingLayoutId, current: ShotTreatment): ShotTreatment {
  if (framingLayout(current) === layout) return current;
  if (layout === 'none') return 'full';
  if (layout === 'zoom') return 'punch-in';
  if (layout === 'split-top-bottom') return 'split-b';
  if (layout === 'split-left-right') return 'split-r';
  return 'corner-br';
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
  onSetTreatCrop,
  onPreviewTreatCrop,
  onSetFilter,
  onPreviewFilter,
  onSetAudio,
}: {
  shot: VideoShot;
  onSetTreatment: (shotId: string, t: ShotTreatment) => void;
  onSetTreatSize: (shotId: string, size: number) => void;
  /** Live preview while dragging (edits the iframe directly, zero setState); commits via onSetTreatSize on release. */
  onPreviewTreatSize: (shotId: string, size: number) => void;
  /** Half-split crop position (0–100 along the split axis, 50 = centred), same live-preview contract. */
  onSetTreatCrop: (shotId: string, crop: number) => void;
  onPreviewTreatCrop: (shotId: string, crop: number) => void;
  /** Commit per-shot grading (null = reset all); live preview via onPreviewFilter while dragging. */
  onSetFilter: (shotId: string, f: ShotFilter | null) => void;
  onPreviewFilter: (shotId: string, f: ShotFilter) => void;
  /** Per-shot audio level (dB). Muting is a TRACK action and lives on the timeline's track header. */
  onSetAudio: (shotId: string, patch: { volumeDb?: number; mute?: boolean }) => void;
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
  // Crop position (half-splits only): a filled half always cuts something — this picks what survives
  const isSplit = shot.treatment.startsWith('split-');
  const committedCrop = shot.treatCrop ?? 50;
  const [dragCrop, setDragCrop] = useState<number | null>(null);
  useEffect(() => setDragCrop(null), [shot.id, shot.treatment]);
  const cropValue = dragCrop ?? committedCrop;
  const commitCrop = () => {
    if (dragCrop != null && dragCrop !== committedCrop) onSetTreatCrop(shot.id, dragCrop);
    setDragCrop(null);
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
  const muted = !!shot.audioMuted;
  const activeLayout = framingLayout(shot.treatment);
  const activePositions = activeLayout === 'none' || activeLayout === 'zoom' ? null : FRAMING_POSITIONS[activeLayout];
  const activePosition = activePositions?.find((option) => option.treatment === shot.treatment)?.id;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Title (framing · scene N)/close live in the floating-window header; only a one-line hint here */}
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.framingAppliesWholeShot')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {FRAMING_LAYOUTS.map((layout) => (
              <LayoutStrategyOption
                key={layout.id}
                id={layout.id}
                label={t(layout.label)}
                selected={activeLayout === layout.id}
                onPick={() => onSetTreatment(shot.id, treatmentForLayout(layout.id, shot.treatment))}
              />
            ))}
          </div>
          {activePositions && activePosition && (
            <InlineLayoutPositionPicker
              title={t('customFrame.corner.position')}
              options={activePositions.map((option) => ({ id: option.id, label: t(option.label) }))}
              value={activePosition}
              onPick={(position) => {
                const treatment = activePositions.find((option) => option.id === position)?.treatment;
                if (treatment) onSetTreatment(shot.id, treatment);
              }}
            />
          )}
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

        {/* Crop position (half-splits): the half is filled, so choose which part of the frame survives */}
        {isSplit && (
          <section className="flex flex-col gap-1.5">
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('panels.cropPosition')}</span>
              <span className="text-ink-4 tabular-nums">{Math.round(cropValue)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={cropValue}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDragCrop(v);
                onPreviewTreatCrop(shot.id, v);
              }}
              onPointerUp={commitCrop}
              onKeyUp={commitCrop}
              onBlur={commitCrop}
              className="zoom-range w-full"
              aria-label={t('panels.cropPosition')}
            />
            <div className="text-ink-4 flex justify-between text-[10px]">
              <span>{shot.treatment === 'split-t' || shot.treatment === 'split-b' ? t('panels.cropTop') : t('panels.cropLeft')}</span>
              <span>{shot.treatment === 'split-t' || shot.treatment === 'split-b' ? t('panels.cropBottom') : t('panels.cropRight')}</span>
            </div>
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

        {/* Sound (whole shot, this segment's own audio): the SAME level control the audio panel uses —
            one slider, one dB scale, one implementation. Muting is per track, up on the timeline. */}
        <section className="flex flex-col gap-1.5">
          <div className="text-ink font-medium">{t('panels.sound')}</div>
          <AudioLevel db={shot.volumeDb ?? 0} disabled={muted} onChange={(db) => onSetAudio(shot.id, { volumeDb: db })} />
          {muted && <div className="text-ink-4 text-[10.5px]">{t('panels.trackMutedHint')}</div>}
        </section>
      </div>
    </div>
  );
}
