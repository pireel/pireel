/** Pure layout constants and helpers for the studio timeline (no React state). */

import { type BlockKind, SHOT_TREATMENTS } from '@pireel/studio-engine/composition';
import type { FilmstripFrame } from '@pireel/studio-ui/media';

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

/** Row density. `comfortable` is the constants above; `compact` trades filmstrip height and lane
 * padding for canvas room — the default for the agent's embedded view, where the timeline is a
 * readout more than an editing surface. */
export type TimelineDensity = 'comfortable' | 'compact';
export interface TimelineMetrics {
  rowH: number;
  audioRowH: number;
  sceneH: number;
  visualSceneH: number;
  scenePadT: number;
  scenePadB: number;
  visualScenePadT: number;
  visualScenePadB: number;
  rowGap: number;
  rulerH: number;
  /** Height of the audio strip drawn along the bottom of each video card. */
  sceneWaveH: number;
}
export const TIMELINE_METRICS: Record<TimelineDensity, TimelineMetrics> = {
  comfortable: {
    rowH: ROW_H, audioRowH: AUDIO_ROW_H, sceneH: SCENE_H, visualSceneH: VISUAL_SCENE_H,
    scenePadT: SCENE_PAD_T, scenePadB: SCENE_PAD_B, visualScenePadT: VISUAL_SCENE_PAD_T, visualScenePadB: VISUAL_SCENE_PAD_B,
    rowGap: ROW_GAP, rulerH: RULER_H, sceneWaveH: 18,
  },
  compact: {
    rowH: 22, audioRowH: 30, sceneH: 44, visualSceneH: 36,
    scenePadT: 4, scenePadB: 3, visualScenePadT: 2, visualScenePadB: 2,
    rowGap: 1, rulerH: 20, sceneWaveH: 10,
  },
};
export const TIMELINE_DENSITY_STORAGE_KEY = 'pireel.studio.timelineDensity';
export const TIMELINE_COLLAPSED_STORAGE_KEY = 'pireel.studio.timelineCollapsed';
export function isTimelineDensity(value: unknown): value is TimelineDensity {
  return value === 'comfortable' || value === 'compact';
}
export const GUTTER = 68; // fixed columns: track kind + mute + visibility
export const EDGE_PAD = 4; // half the playhead's head: at 0 s (and at the end) it would otherwise slip under the sticky gutter (or the scroll edge)
export const CAP_LANE = -1; // "caption lane" sentinel track number: read-only, no drag/reorder, not in z-reorder, not in marquee; real track numbers are always >=0
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
/** A clip card's border and selection frame are drawn on its ::after, above its own positioned
 *  content: an outline on the card itself is painted under its absolutely placed thumbnails, which
 *  hid the frame's top edge. Colour and width classes go on as after:outline-*. */
export const TIMELINE_ITEM_FRAME = 'after:pointer-events-none after:absolute after:inset-0 after:z-[25] after:rounded-[inherit]';
export const TIMELINE_ITEM_EDGE_RADIUS = {
  left: 'rounded-l-sm',
  right: 'rounded-r-sm',
} as const;
/** Trim handles at a clip's edges. Selected: filled with the selection colour (so the frame reads
 *  as one piece with thicker ends) and a grip line in the panel colour; hovered: a neutral ink tint.
 *  Both come from theme tokens, so they read on light and dark themes and over any thumbnail.
 *  `hover` is the group-hover variant of the card that owns the handle. */
const TRIM_HANDLE_HOVER = {
  'group-hover': 'bg-transparent group-hover:bg-ink/35',
  'group-hover/shot': 'bg-transparent group-hover/shot:bg-ink/35',
  'group-hover/aud': 'bg-transparent group-hover/aud:bg-ink/35',
} as const;
export function trimHandleClass(selected: boolean, tone: string, hover: keyof typeof TRIM_HANDLE_HOVER = 'group-hover'): string {
  return selected
    ? `${tone} after:absolute after:inset-y-1/4 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-panel`
    : TRIM_HANDLE_HOVER[hover];
}

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
 * (with the caller's overscan already included in visibleStart/visibleEnd). `tileDur` is the
 * timeline seconds one tile spans on screen. */
export function visibleStripTiles(
  strip: FilmstripFrame[],
  srcStart: number,
  srcEnd: number,
  tileDur: number,
  pps: number,
  timelineStartSec: number,
  visibleStartSec: number,
  visibleEndSec: number,
  timelineEndSec: number = timelineStartSec + (srcEnd - srcStart),
): { left: number; width: number; url: string }[] {
  if (!strip.length || tileDur <= 0 || pps <= 0 || srcEnd <= srcStart || visibleEndSec < visibleStartSec) return [];
  const sourceDurationSec = srcEnd - srcStart;
  const timelineDurationSec = timelineEndSec - timelineStartSec;
  if (timelineDurationSec <= 0) return [];
  // Video speed is source duration / timeline duration. Tiles keep their on-screen size at any
  // speed (every card shows the same picture shape); the speed changes how much source one tile
  // stands for, so a slowed clip shows more tiles of nearby frames, a sped-up one fewer, far apart.
  // The grid stays anchored on source time so the halves of a split clip continue one strip.
  const sourceRate = sourceDurationSec / timelineDurationSec;
  const step = tileDur * sourceRate; // source seconds per tile
  const sourceFirst = Math.floor(srcStart / step);
  const sourceLast = Math.ceil(srcEnd / step) - 1;
  const visibleSourceStart = srcStart + (visibleStartSec - timelineStartSec) * sourceRate;
  const visibleSourceEnd = srcStart + (visibleEndSec - timelineStartSec) * sourceRate;
  const visibleFirst = Math.ceil((visibleSourceStart - step) / step);
  const visibleLast = Math.floor(visibleSourceEnd / step);
  const first = Math.max(sourceFirst, visibleFirst);
  const last = Math.min(sourceLast, visibleLast);
  const tiles: { left: number; width: number; url: string }[] = [];
  for (let k = first; k <= last; k++) {
    const srcT = (k + 0.5) * step;
    let closest = strip[0]!;
    let distance = Number.POSITIVE_INFINITY;
    for (const frame of strip) {
      const candidate = Math.abs(frame.t - srcT);
      if (candidate < distance) {
        closest = frame;
        distance = candidate;
      }
    }
    tiles.push({
      left: ((k * step - srcStart) / sourceRate) * pps,
      width: tileDur * pps,
      url: closest.url,
    });
  }
  return tiles;
}

/** Timeline chip category background colors (base label/icon/dot live in shared kind-meta.ts). */
export const KIND_CHIP: Record<BlockKind, { chip: string; chipSel: string; handle: string }> = {
  caption: { chip: 'bg-rose-500/15 after:outline-rose-400/30 hover:bg-rose-500/25', chipSel: 'bg-rose-500/30 after:outline-rose-600 dark:after:outline-rose-400', handle: 'bg-rose-600 dark:bg-rose-400' },
  title: { chip: 'bg-amber-500/15 after:outline-amber-400/30 hover:bg-amber-500/25', chipSel: 'bg-amber-500/30 after:outline-amber-600 dark:after:outline-amber-400', handle: 'bg-amber-600 dark:bg-amber-400' },
  stat: { chip: 'bg-emerald-500/15 after:outline-emerald-400/30 hover:bg-emerald-500/25', chipSel: 'bg-emerald-500/30 after:outline-emerald-600 dark:after:outline-emerald-400', handle: 'bg-emerald-600 dark:bg-emerald-400' },
  list: { chip: 'bg-sky-500/15 after:outline-sky-400/30 hover:bg-sky-500/25', chipSel: 'bg-sky-500/30 after:outline-sky-600 dark:after:outline-sky-400', handle: 'bg-sky-600 dark:bg-sky-400' },
  transition: { chip: 'bg-violet-500/15 after:outline-violet-400/30 hover:bg-violet-500/25', chipSel: 'bg-violet-500/30 after:outline-violet-600 dark:after:outline-violet-400', handle: 'bg-violet-600 dark:bg-violet-400' },
  media: { chip: 'bg-teal-500/15 after:outline-teal-400/30 hover:bg-teal-500/25', chipSel: 'bg-teal-500/30 after:outline-teal-600 dark:after:outline-teal-400', handle: 'bg-teal-600 dark:bg-teal-400' },
  custom: { chip: 'bg-slate-400/15 after:outline-slate-300/30 hover:bg-slate-400/25', chipSel: 'bg-slate-400/30 after:outline-slate-600 dark:after:outline-slate-400', handle: 'bg-slate-600 dark:bg-slate-400' },
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
