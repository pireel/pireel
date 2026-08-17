/** Pure layout constants and helpers for the studio timeline (no React state). */

import { type BlockKind, SHOT_TREATMENTS } from '@pireel/studio-engine/composition';
import type { FilmstripFrame } from './media';

export const PREVIEW_W = 108; // hover element preview width

export const ROW_H = 30; // overlay track (element/caption) row height: compact to save space (user's call)
export const AUDIO_ROW_H = 44; // music lane: taller than an overlay row — the waveform and the fade knobs need the room
export const SCENE_H = 72; // semantic primary rail: largest native-video lane
export const VISUAL_SCENE_H = 56; // detached video is dense, while retaining the primary card's thumbnail + wave language
export const SCENE_PAD_T = 8; // enough blank edge for marquee/track insertion without making the rail feel loose
export const SCENE_PAD_B = 6;
export const VISUAL_SCENE_PAD_T = 3;
export const VISUAL_SCENE_PAD_B = 3;
export const ROW_GAP = 2;
export const RULER_H = 24;
export const GUTTER = 68; // fixed columns: track kind + mute + visibility
export const CAP_LANE = -1; // "caption lane" sentinel track number: read-only, no drag/reorder, not in z-reorder, not in marquee; real track numbers are always >=0
export const EDGE_PAD = 12; // breathing room between gutter and content: keeps the first block's outset selection ring from being clipped by the sticky gutter
export const SHOT_GAP = 2; // hairline gap between shot cards (taken off the right edge, left edge stays time-accurate)
export const MIN_PPS = 2; // min zoom: ~2px/s, shows minute scale (1 min ~= 120px, ticks go by minutes)
export const MAX_PPS = 260;
export const DEFAULT_PPS = 78;
export const MIN_DUR = 0.3;
export const SNAP_PX = 8;

/** Convert a content-space pointer second to timeline time. Most interactions stay inside the
 * current project, while a right trim handle must be able to create a later project end. */
export function timelinePointerSecond(rawSec: number, durationSec: number, allowAfterEnd = false): number {
  const second = Math.max(0, Number.isFinite(rawSec) ? rawSec : 0);
  const duration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  return allowAfterEnd ? second : Math.min(duration, second);
}

/** Keep a fixed physical editing tail after the project end, then move that tail with an active
 * end-trim pointer. Pixel-based space stays equally usable at every zoom level and avoids a layout
 * jump when the user first grabs the last clip. */
export function timelineResizeSurfaceDuration(durationSec: number, pps: number, resizeEndSec?: number): number {
  const duration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  const tailSec = Math.max(2, 160 / Math.max(1, Number.isFinite(pps) ? pps : 1));
  const pointer = resizeEndSec == null
    ? duration
    : Math.max(0, Number.isFinite(resizeEndSec) ? resizeEndSec : 0);
  return Math.max(duration, pointer) + tailSec;
}

/** Latest timeline end reachable without changing playback speed. Unknown source duration remains
 * unbounded; the document command performs the same final clamp when the gesture commits. */
export function timelineSourceResizeEnd(
  startSec: number,
  endSec: number,
  sourceInSec: number,
  sourceOutSec: number,
  sourceDurationSec?: number,
): number {
  if (sourceDurationSec == null || !Number.isFinite(sourceDurationSec)) return Number.POSITIVE_INFINITY;
  const timelineSpan = endSec - startSec;
  const sourceSpan = sourceOutSec - sourceInSec;
  if (timelineSpan <= 0 || sourceSpan <= 0) return endSec;
  const sourceRate = sourceSpan / timelineSpan;
  return endSec + Math.max(0, sourceDurationSec - sourceOutSec) / sourceRate;
}

export interface TimelinePlacementSpan {
  id: string;
  startSec: number;
  endSec: number;
}

/** Snap an inspector pick to the nearest real video frame and keep it inside the half-open timeline. */
export function quantizeTimelineFrameSecond(rawSec: number, durationSec: number, rawFps: number): number {
  const fps = Math.max(1, Number.isFinite(rawFps) ? rawFps : 30);
  const duration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  const second = Math.max(0, Number.isFinite(rawSec) ? rawSec : 0);
  return Math.min(Math.round(second * fps) / fps, Math.max(0, duration - 1 / fps));
}

/** Half-open range collision used by the drag planner. Touching edges are allowed; a real overlap
 * means the clip must be stacked on a new visual lane instead of trimming destination material. */
export function timelinePlacementOverlaps(
  spans: readonly TimelinePlacementSpan[],
  startSec: number,
  durationSec: number,
  excludeId?: string,
): boolean {
  const endSec = startSec + durationSec;
  return spans.some((span) => span.id !== excludeId && span.startSec < endSec - 1e-4 && span.endSec > startSec + 1e-4);
}

/** Primary auto-snap is a packing constraint, not a proximity magnet. The pointer chooses an insert
 * position by clip centres; the returned start is the sum of every preceding duration, so the lane
 * always begins at zero and cannot contain an inter-clip gap. */
export function packedPrimaryPlacement(
  spans: readonly TimelinePlacementSpan[],
  movingId: string,
  rawStartSec: number,
  durationSec: number,
): { index: number; startSec: number } {
  const others = spans
    .filter((span) => span.id !== movingId)
    .sort((left, right) => left.startSec - right.startSec || left.id.localeCompare(right.id));
  const movingCenter = rawStartSec + durationSec / 2;
  const index = others.findIndex((span) => movingCenter < (span.startSec + span.endSec) / 2);
  const resolvedIndex = index < 0 ? others.length : index;
  const startSec = others.slice(0, resolvedIndex).reduce((sum, span) => sum + Math.max(0, span.endSec - span.startSec), 0);
  return { index: resolvedIndex, startSec: Math.round(startSec * 1000) / 1000 };
}

/** One compact radius for every piece of content placed on a timeline lane. Keep the matching
 * edge-handle radii here too, so video, graphics, captions and audio cannot drift independently. */
export const TIMELINE_ITEM_RADIUS = 'rounded-sm';
export const TIMELINE_ITEM_EDGE_RADIUS = {
  left: 'rounded-l-sm',
  right: 'rounded-r-sm',
} as const;

/** Source-time-anchored filmstrip window (like a mainstream editor): tile k always covers source time
 *  [k,k+1)*tileDur; take tiles that intersect the window [srcStart,srcEnd). First tile's left
 *  can be negative (clipped by the card's overflow-hidden) — a split at 2.5 tiles gives 2.5
 *  tiles before and the rest continuing from the middle of tile 2.5, so trailing tiles never resample. */
export function stripTiles(strip: FilmstripFrame[], srcStart: number, srcEnd: number, tileDur: number, pps: number): { left: number; url: string }[] {
  if (!strip.length || tileDur <= 0 || srcEnd <= srcStart) return [];
  const tiles: { left: number; url: string }[] = [];
  for (let k = Math.floor(srcStart / tileDur); k * tileDur < srcEnd; k++) {
    const srcT = (k + 0.5) * tileDur;
    let url = strip[0]!.url;
    let bd = Infinity;
    for (const f of strip) {
      const d = Math.abs(f.t - srcT);
      if (d < bd) {
        bd = d;
        url = f.url;
      }
    }
    tiles.push({ left: (k * tileDur - srcStart) * pps, url });
  }
  return tiles;
}

/** Keep filmstrip DOM proportional to the viewport, not the project duration. Cards remain mounted
 * for editing geometry, but their image tiles are created only when their timeline span is visible
 * (with the caller's overscan already included in visibleStart/visibleEnd). */
export function visibleStripTiles(
  strip: FilmstripFrame[],
  srcStart: number,
  srcEnd: number,
  tileDur: number,
  pps: number,
  timelineStartSec: number,
  visibleStartSec: number,
  visibleEndSec: number,
): { left: number; url: string }[] {
  if (!strip.length || tileDur <= 0 || pps <= 0 || srcEnd <= srcStart || visibleEndSec < visibleStartSec) return [];
  const sourceFirst = Math.floor(srcStart / tileDur);
  const sourceLast = Math.ceil(srcEnd / tileDur) - 1;
  const visibleFirst = Math.ceil((visibleStartSec - timelineStartSec + srcStart - tileDur) / tileDur);
  const visibleLast = Math.floor((visibleEndSec - timelineStartSec + srcStart) / tileDur);
  const first = Math.max(sourceFirst, visibleFirst);
  const last = Math.min(sourceLast, visibleLast);
  const tiles: { left: number; url: string }[] = [];
  for (let k = first; k <= last; k++) {
    const srcT = (k + 0.5) * tileDur;
    let closest = strip[0]!;
    let distance = Number.POSITIVE_INFINITY;
    for (const frame of strip) {
      const candidate = Math.abs(frame.t - srcT);
      if (candidate < distance) {
        closest = frame;
        distance = candidate;
      }
    }
    tiles.push({ left: (k * tileDur - srcStart) * pps, url: closest.url });
  }
  return tiles;
}

/** Timeline chip category background colors (base label/icon/dot live in shared kind-meta.ts). */
export const KIND_CHIP: Record<BlockKind, { chip: string; chipSel: string }> = {
  caption: { chip: 'bg-rose-500/15 ring-rose-400/30 hover:bg-rose-500/25', chipSel: 'bg-rose-500/30 ring-2 ring-rose-400' },
  title: { chip: 'bg-amber-500/15 ring-amber-400/30 hover:bg-amber-500/25', chipSel: 'bg-amber-500/30 ring-2 ring-amber-400' },
  stat: { chip: 'bg-emerald-500/15 ring-emerald-400/30 hover:bg-emerald-500/25', chipSel: 'bg-emerald-500/30 ring-2 ring-emerald-400' },
  list: { chip: 'bg-sky-500/15 ring-sky-400/30 hover:bg-sky-500/25', chipSel: 'bg-sky-500/30 ring-2 ring-sky-400' },
  transition: { chip: 'bg-violet-500/15 ring-violet-400/30 hover:bg-violet-500/25', chipSel: 'bg-violet-500/30 ring-2 ring-violet-400' },
  media: { chip: 'bg-teal-500/15 ring-teal-400/30 hover:bg-teal-500/25', chipSel: 'bg-teal-500/30 ring-2 ring-teal-400' },
  custom: { chip: 'bg-slate-400/15 ring-slate-300/30 hover:bg-slate-400/25', chipSel: 'bg-slate-400/30 ring-2 ring-slate-400' },
};
export const TREATMENT_NAME: Record<string, string> = Object.fromEntries(SHOT_TREATMENTS.map((t) => [t.id, t.name]));

/** Adaptive ruler step: keep each cell >= ~64px. */
export function rulerStep(pps: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pps >= 64) return s;
  return 1200;
}

/** Tick label: mm:ss for >=60s, otherwise Xs. */
export function fmtTick(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
