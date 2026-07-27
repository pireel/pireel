'use client';

/**
 * Pro multi-track timeline (Google Vids style).
 *
 * Track 0 = talking-head video: filmstrip base with shot slices on top (each with its own
 *   camera treatment; boundary = jump cut, no transition semantics).
 *   Track >=1 = overlay elements (captions/title/stat/list/transition...): each block has a
 *   type icon + label (shows time range when selected), is draggable whole, trimmable at both
 *   ends, and clickable to open in the right-side chat.
 *   Left gutter shows a type icon per track; top zoom bar (in/out/fit); ruler major/minor ticks;
 *   draggable playhead.
 *
 * All x are measured relative to the content layer (contentRef); snaps to whole seconds /
 * shot cut points / other block edges / playhead.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Film, Loader2, Music, Plus } from 'lucide-react';
import {
  type Block,
  type BlockKind,
  type Composition,
  blockKind,
  blockPreviewDoc,
  cutTransitions,
  editedVideoDuration,
  MAX_TRANSITION_SEC,
  totalDuration,
  isSentenceCaption,
} from '@pireel/studio-engine/composition';
import { AUDIO_FADE_MAX_SEC, type AudioClip, audioClipDefaults, audioClipWindow, audioTrimPatch, fadeShape } from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { injectPreviewRuntime } from './sample-composition';
import { KIND_META } from './kind-meta';
import { t } from './i18n';
import { playhead } from './playhead';
import type { FilmstripFrame } from './media';
import {
  CAP_LANE,
  EDGE_PAD,
  GUTTER,
  KIND_CHIP,
  MAX_PPS,
  MIN_DUR,
  MIN_PPS,
  PREVIEW_W,
  ROW_GAP,
  AUDIO_ROW_H,
  ROW_H,
  RULER_H,
  SCENE_H,
  SCENE_PAD_B,
  SCENE_PAD_T,
  SHOT_GAP,
  SNAP_PX,
  TREATMENT_NAME,
  fmtTick,
  rulerStep,
  stripTiles,
} from './timeline-utils';
import { ActiveSceneRing, PlayheadCursor } from './timeline-overlays';

export { DEFAULT_PPS, MAX_PPS, MIN_PPS } from './timeline-utils';

/* ---- Audio chip geometry (mirrors the reference editor's ClipRenderer) ---- */
/** Chip height inside the music lane (row height minus the 2px breathing room top and bottom). */
const CHIP_H = AUDIO_ROW_H - 4;
/** Label strip across the top; the waveform, fade wedge and knees all live in the BODY below it. */
const CHIP_LABEL_H = 14;
const CHIP_BODY_H = CHIP_H - CHIP_LABEL_H;
/** Knees sit in a fixed "fade lane" a few px below the body's top edge — not on the chip's corner. */
const KNEE_LANE_Y = 4;
const KNEE_SIZE = 10;
/** Knees stay this far inside the clip so they never hide under the trim handles or get clipped. */
const KNEE_EDGE_INSET = 10;
/** Height of the audio strip drawn along the bottom of each scene card (the video's own sound). */
const SCENE_WAVE_H = 18;

/** Waveform vertical scale: dBFS against a noise floor, the pro-tool convention (the reference editor
 *  normalizes 20·log10(peak) over a -50 dB floor; Audacity's Waveform (dB) view and Premiere's
 *  "logarithmic waveform scaling" are the same idea). Linear amplitude draws everything quiet as a flat
 *  line — hearing is logarithmic, so the drawing is too. */
const WAVE_FLOOR_DB = -50;
/** Bars are 1px with no gaps (filled silhouette); the cap only kicks in on absurdly zoomed-in chips, to
 *  bound the path string. */
const WAVE_BAR_PX = 1;
const WAVE_MAX_BARS = 2400;

/** Waveform bars for one audio chip, in BODY pixel coordinates (the svg is 1:1 with px — no viewBox
 *  stretching, which is what squashed earlier shapes). Bar height = the source peak in dBFS shifted by
 *  the clip's VOLUME (dB-axis shift), then SHAPED BY THE FADE ENVELOPE — the wave's own top edge is the
 *  fade curve, which is how the reference reads: the fades cut the wave, no wedge is painted over it.
 *  Built over the clip's trimmed [in,out] slice against its true content width, so trimming an edge only
 *  reveals or hides the content. */
function waveBars(
  peaks: Float32Array,
  from: number,
  to: number,
  widthPx: number,
  heightPx: number,
  shiftDb: number,
  envelopeAt?: (frac: number) => number,
): string {
  const a = Math.max(0, Math.min(peaks.length - 1, from));
  const b = Math.max(a + 1, Math.min(peaks.length, to));
  const cols = Math.max(1, Math.min(WAVE_MAX_BARS, Math.round(widthPx / WAVE_BAR_PX)));
  const barW = widthPx / cols;
  const step = (b - a) / cols;
  const parts: string[] = [];
  for (let i = 0; i < cols; i++) {
    const s0 = a + Math.floor(i * step);
    const s1 = Math.max(s0 + 1, a + Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = s0; j < s1 && j < peaks.length; j++) if (peaks[j]! > peak) peak = peaks[j]!;
    // dB axis shifted by the level: a boost pushes bars up against the ceiling (where they flatten, exactly
    // as the level itself does), an attenuation lowers the whole shape
    const db = peak > 0 ? 20 * Math.log10(peak) + shiftDb : WAVE_FLOOR_DB;
    const frac = Math.max(0, Math.min(1, (db - WAVE_FLOOR_DB) / -WAVE_FLOOR_DB));
    const h = Math.max(0.7, frac * (heightPx - 1)) * (envelopeAt ? envelopeAt((i + 0.5) / cols) : 1);
    if (h <= 0.05) continue;
    const x = i * barW;
    parts.push(`M${x.toFixed(2)},${heightPx}h${barW.toFixed(2)}v${-h.toFixed(1)}h${(-barW).toFixed(2)}Z`);
  }
  return parts.join('');
}

function audioWaveBars(peaks: Float32Array, clip: AudioClip, d: ReturnType<typeof audioClipDefaults>, widthPx: number, spanSec: number): string {
  const dur = clip.durationSec ?? 0;
  const lo = dur > 0 ? Math.floor((d.inSec / dur) * peaks.length) : 0;
  const hi = dur > 0 && Number.isFinite(d.outSec) ? Math.ceil((d.outSec / dur) * peaks.length) : peaks.length;
  return waveBars(peaks, lo, hi, widthPx, CHIP_BODY_H, d.volumeDb, (f) => {
    // fade envelope at this bar's moment — the same curve the gain applies
    const tLocal = f * spanSec;
    let fade = 1;
    if (d.fadeInSec > 0) fade *= fadeShape(tLocal / d.fadeInSec);
    if (d.fadeOutSec > 0) fade *= fadeShape((spanSec - tLocal) / d.fadeOutSec);
    return fade;
  });
}

/** The clip body's own silhouette: full height through the middle, tapering along the fade envelope at
 *  both ends — so the BACKGROUND reads as the fade too, not just the wave sitting inside a flat block.
 *  Same fadeShape the gain uses; body px coordinates. */
function audioBodyPath(d: ReturnType<typeof audioClipDefaults>, widthPx: number, spanSec: number): string {
  const H = CHIP_BODY_H;
  const STEPS = 12;
  const pts: string[] = [`0,${H}`];
  const ramp = (fromX: number, toX: number, rising: boolean) => {
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const px = fromX + (toX - fromX) * t;
      const f = rising ? fadeShape(t) : fadeShape(1 - t);
      pts.push(`${px.toFixed(2)},${(H - f * H).toFixed(2)}`);
    }
  };
  const fi = d.fadeInSec > 0 ? (d.fadeInSec / Math.max(0.05, spanSec)) * widthPx : 0;
  const fo = d.fadeOutSec > 0 ? (d.fadeOutSec / Math.max(0.05, spanSec)) * widthPx : 0;
  if (fi > 0) ramp(0, Math.min(widthPx, fi), true);
  else pts.push(`0,0`);
  pts.push(`${Math.max(0, widthPx - fo).toFixed(2)},0`);
  if (fo > 0) ramp(Math.max(0, widthPx - fo), widthPx, false);
  else pts.push(`${widthPx.toFixed(2)},0`);
  pts.push(`${widthPx.toFixed(2)},${H}`);
  return `M${pts.join('L')}Z`;
}

/** Where a fade knob sits horizontally (body px), clamped so it stays grabbable inside the clip. */
function audioKneeX(fadeSec: number, edge: 'in' | 'out', widthPx: number, spanSec: number): number {
  const raw = (Math.max(0, fadeSec) / Math.max(0.05, spanSec)) * widthPx;
  const inset = Math.min(KNEE_EDGE_INSET, Math.max(0, widthPx / 2));
  const at = edge === 'in' ? raw : widthPx - raw;
  return Math.min(widthPx - inset, Math.max(inset, at));
}

interface StudioTimelineProps {
  comp: Composition;
  /** During playback: auto-scroll to follow the playhead when it leaves the viewport (stops if the user scrolls manually, until next play). */
  playing: boolean;
  /** Locate signal: each increment = scroll the timeline to center on the current playhead (triggered by clicking the transport time readout). */
  locateSignal: number;
  /** Shot multi-select set (Cmd-click / marquee): highlight + batch delete + playhead ring yields. Single select = a one-element set. */
  selectedShotIds: Set<string>;
  /** Block multi-select set (Cmd-click / marquee, can span multiple element tracks): highlight + batch delete. Single select = a one-element set. */
  selectedBlockIds: Set<string>;
  filmstrip?: FilmstripFrame[];
  /** Zoom (px/sec) is controlled: value and setter both come from the transport slider. */
  pps: number;
  onPps: React.Dispatch<React.SetStateAction<number>>;
  onSeek: (t: number) => void;
  /** Hover preview: seek the center player to this time (without moving the playhead); null = restore to the playhead. */
  onScrub: (t: number | null) => void;
  onSelect: (id: string | null) => void;
  /** Select a shot. additive = Cmd/Ctrl multi-select (toggle in/out of the set). */
  onSelectShot: (id: string, additive?: boolean) => void;
  /** Marquee: drag a rectangle from the **top/bottom gap** of the scene track (like CapCut; dragging from the card = reorder); matched shot ids all become the multi-select set. */
  onBoxSelectShots: (ids: string[]) => void;
  /** Scene card drag-reorder (drag from the card, like CapCut): move clip `from` to position `to` in the clip sequence (splice semantics). */
  onReorderShot?: (from: number, to: number) => void;
  /** Move a block across tracks (drag chip vertically into another element track row): changing trackIndex = changing z (NLE convention).
   *  Empty tracks vanish on their own — track rows derive from blocks, so emptying one collapses it; no explicit cleanup. */
  onMoveBlockTrack?: (id: string, trackIndex: number) => void;
  /** Drag a block into a row gap = spawn a new track (like CapCut): slot = insert position in the overlay tracks' top-to-bottom display order (0..N).
   *  Workbench recomputes all z (same rule as gutter drag-reorder; z=1 is always the caption layer). */
  onMoveBlockNewTrack?: (id: string, slot: number) => void;
  /** Select a block. additive = Cmd/Ctrl multi-select (toggle in/out of the set, without moving the playhead). */
  onSelectBlock: (id: string, additive?: boolean) => void;
  /** Marquee blocks: drag a rectangle over empty element-track space (can span tracks); matched block ids all become the multi-select set. */
  onBoxSelectBlocks: (ids: string[]) => void;
  /** Click empty space: clear all selection (blocks + shots). */
  onDeselectAll: () => void;
  /** Shot's bottom-left treatment tag: opens the treatment settings panel directly (clicking the shot body only selects, doesn't open the panel). */
  onOpenShotSettings: (id: string) => void;
  /** Set a shot's camera treatment (full/zoom/corner/split); treatment always applies to the whole shot */
  onMoveBlock: (id: string, newStartSec: number) => void;
  onResizeBlock: (id: string, newStartSec: number, newDurationSec: number) => void;
  /** Overlay track reorder (gutter drag): pass the new top-to-bottom track-number order; workbench recomputes z. */
  onReorderTracks: (topToBottom: number[]) => void;
  /** A panel asset is being dragged (a card dragged out of upload/image-gen/video-gen): the timeline becomes a drop zone.
   *  Drop routing: main track (filmstrip / scene card row) = insert a clip (image = 5s static frame; user's 2026-07-17 call,
   *  reverting the earlier "video-into-main-track removed"); elsewhere = a picture-in-picture asset block, video ignored. */
  assetDragging?: boolean;
  /** Dragged asset type. Drop-zone rules: image = main track (5s static-frame clip) + overlay area (picture-in-picture);
   *  video = main track only (whole clip); element = overlay area only (inserted at the drop time, same as image). */
  assetDragKind?: 'image' | 'video' | 'audio' | 'element' | null;
  /** Asset (image) dropped on a non-main-track area: report the drop time (sec); workbench inserts an asset block there. */
  onDropAsset?: (t: number) => void;
  /** Asset dropped on the main track: handled as a clip insert (video = whole clip, image = 5s static frame); workbench fetches bytes via insertClipCore. */
  onDropAssetClip?: (t: number) => void;
  /** Audio asset dropped anywhere on the timeline: add a clip starting at the drop time (music lane). */
  onDropAssetAudio?: (t: number) => void;
  /** Music-lane chip dragged horizontally: commit that clip's new start (edited seconds). */
  onMoveAudio?: (id: string, startSec: number) => void;
  /** Music-lane edge handle released: commit the trim patch (in/out points, computed by audioTrimPatch). */
  onTrimAudio?: (id: string, patch: { startSec?: number; inSec?: number; outSec?: number }) => void;
  /** Music-lane fade knee released: commit that clip's fade length (seconds). */
  onFadeAudio?: (id: string, edge: 'in' | 'out', sec: number) => void;
  /** Peak envelopes per clip sig (lane waveform); absent = bytes not mounted, chip draws label-only. */
  audioPeaks?: Map<string, Float32Array>;
  /** Peak envelopes per VIDEO source ('main' / insert-clip url): the scene cards draw their own audio. */
  sourcePeaks?: Map<string, { peaks: Float32Array; durationSec: number }>;
  /** Music-lane selection (shared with the audio panel; Del deletes the selected clip in workbench). */
  selectedAudioId?: string | null;
  onSelectAudio?: (id: string | null) => void;
  /** Click a chip (no drag): select + open the audio panel. */
  onOpenMusicPanel?: () => void;
  /** Filmstrips for externally inserted clips (shotId -> frames, t = the clip's own source time). */
  clipStrips?: Record<string, FilmstripFrame[]>;
  /** Shot boundary "+": insert a local video at that edited-time (workbench pops a file picker -> upload -> insert into main track). */
  onInsertClipAt?: (t: number) => void;
  /** Shot boundary transition hotspot: click to pick a transition effect in the shared popover (cutSec = that boundary's edited-time). */
  onOpenTransition?: (cutSec: number, anchor: DOMRect) => void;
  /** Transition handles drag on both sides (symmetric): commit the new total duration (sec, <=4). */
  onResizeTransition?: (shotId: string, durationSec: number) => void;
  /** External clip insert in progress (download/upload/reading duration): draw an "inserting" badge at that edited-time so the user doesn't think it failed. */
  clipPendingAt?: number | null;
}

/** memo: callback props have stable identity via the workbench's useStableCallbacks; timeline-irrelevant
 *  state changes in the workbench (export progress / panel switch / generating state) no longer re-render this big tree. comp changes still render as usual. */
export const StudioTimeline = memo(StudioTimelineImpl);

function StudioTimelineImpl({
  comp,
  playing,
  locateSignal,
  selectedShotIds,
  selectedBlockIds,
  filmstrip,
  pps,
  onPps,
  onSeek,
  onScrub,
  onSelect,
  onSelectShot,
  onBoxSelectShots,
  onReorderShot,
  onMoveBlockTrack,
  onMoveBlockNewTrack,
  onSelectBlock,
  onBoxSelectBlocks,
  onDeselectAll,
  onOpenShotSettings,
  onMoveBlock,
  onResizeBlock,
  onReorderTracks,
  assetDragging,
  assetDragKind,
  onDropAsset,
  onDropAssetClip,
  onDropAssetAudio,
  onMoveAudio,
  onTrimAudio,
  onFadeAudio,
  audioPeaks,
  sourcePeaks,
  selectedAudioId,
  onSelectAudio,
  onOpenMusicPanel,
  onInsertClipAt,
  onOpenTransition,
  onResizeTransition,
  clipPendingAt,
  clipStrips,
}: StudioTimelineProps) {
  const dur = totalDuration(comp);
  const videoDur = comp.video ? editedVideoDuration(comp) : 0; // edited video duration (filmstrip / scene track width)
  const shots = useMemo(() => comp.shots ?? [], [comp.shots]);
  // Scenes' spans on the **edited** timeline (clip source spans joined end to end)
  const sceneSpans = useMemo(() => clipSpans(shots).map((sp) => ({ shot: sp.clip, start: sp.editedStart, end: sp.editedEnd })), [shots]);
  // Filmstrip tiles (like CapCut): square tiles (width=height, object-cover crop), grid anchored on **source time** —
  // each card just "windows" (stripTiles) the continuous strip; after split/trim each segment continues the original strip, never re-laying-out trailing segments
  // Card = thumbnails on top, the footage's own audio strip beneath them (never overlaid — a wave drawn on
  // the picture is unreadable). Tiles stay square against the film area, so its height drives their width.
  const filmH = SCENE_H - SCENE_PAD_T - SCENE_PAD_B - SCENE_WAVE_H;
  const thumbW = filmH;
  const tileDur = thumbW / pps; // source duration one tile covers
  const filmTiles = useMemo(() => stripTiles(filmstrip ?? [], 0, videoDur, tileDur, pps), [filmstrip, videoDur, tileDur, pps]);

  const [hover, setHover] = useState<{ block: Block; left: number; top: number } | null>(null); // hover element preview
  const [guide, setGuide] = useState<number | null>(null); // snap alignment guide while dragging (sec)
  const [dropHint, setDropHint] = useState<{ t: number; clip: boolean } | null>(null); // insert-point marker during asset drag (clip = hovering main track, drop = insert a clip)
  const [hoverBounds, setHoverBounds] = useState<{ l: number; r: number } | null>(null); // hovered shot card: show "+" at both ends to insert a local video
  const [trDrag, setTrDrag] = useState<{ cut: number; half: number } | null>(null); // live half-width while dragging a transition handle (symmetric)
  const [marquee, setMarquee] = useState<{ l: number; r: number } | null>(null); // scene-track marquee rectangle (content px)
  const laneRef = useRef<HTMLDivElement | null>(null); // scene-track DOM (content-coordinate base, moves with scroll)
  const marqueeDraggedRef = useRef(false); // whether this pointer-down became a marquee drag (used to suppress the subsequent shot click)
  const [blockMarquee, setBlockMarquee] = useState<{ l: number; r: number; t: number; b: number } | null>(null); // element-track marquee rectangle (tracksRef px, includes y for cross-track)
  const tracksRef = useRef<HTMLDivElement | null>(null); // track background area DOM (coordinate base for block marquee)
  const blockMarqueeDraggedRef = useRef(false); // whether the block marquee became a drag (suppress the subsequent block click)
  const marqueeRafRef = useRef(0); // rAF during marquee (edge auto-scroll + recompute rectangle each frame)
  const [hoverT, setHoverT] = useState<number | null>(null); // hover time (center preview jumps to this frame + draw hover vertical line)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false); // while dragging: let hover-seek yield (avoid double seek)
  const hoverRaf = useRef(0); // hover rAF coalescing
  const hoverXRef = useRef(0); // latest hover screen x
  /** Detach the document-level hover escape guards (installed when hover-scrub arms). */
  const scrubGuardCleanupRef = useRef<(() => void) | null>(null);
  /** Idempotent end-of-hover restore: mouseleave AND the escape guards all route here — whoever fires
   *  first restores the preview to the playhead and disarms; later calls are no-ops. */
  const endScrubRef = useRef<() => void>(() => {});
  endScrubRef.current = () => {
    scrubGuardCleanupRef.current?.();
    scrubGuardCleanupRef.current = null;
    if (hoverRaf.current) {
      cancelAnimationFrame(hoverRaf.current);
      hoverRaf.current = 0;
    }
    const armed = scrubArmedRef.current;
    scrubEnterRef.current = null;
    scrubArmedRef.current = false;
    setHoverT(null);
    if (armed) onScrub(null); // restore to the playhead (if never armed, the preview never moved, so no restore needed)
  };
  useEffect(() => () => scrubGuardCleanupRef.current?.(), []);
  // hover-scrub arming: only start following-seek of the center preview after >=160ms in the timeline and >=6px of real movement.
  // A cursor "passing through" the timeline on its way from an element track to the stage, or a layout shift from the selection control bar appearing, shouldn't make the picture jump.
  const scrubEnterRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const scrubArmedRef = useRef(false);

  const openHover = (block: Block, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setHover({ block, left: r.left, top: r.top });
    }, 220);
  };
  const closeHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);
  const hoverDoc = useMemo(() => (hover ? injectPreviewRuntime(blockPreviewDoc(comp, hover.block, { ground: 'checker' })) : ''), [hover, comp]);
  const previewScale = PREVIEW_W / comp.width;
  const previewH = Math.round(comp.height * previewScale);

  const W = Math.max(320, dur * pps);
  const x = useCallback((s: number) => s * pps, [pps]);

  // Snap points: whole seconds + shot cut points (start + end) + other blocks' two ends. The playhead changes every frame, so it's not in memo; read live from the store at snap time.
  const snapPoints = useMemo(() => {
    const pts: number[] = [];
    for (let s = 0; s <= dur; s += 1) pts.push(s);
    for (const sp of sceneSpans) {
      pts.push(sp.start);
      pts.push(sp.end);
    }
    for (const b of comp.blocks) {
      pts.push(b.startSec);
      pts.push(b.startSec + b.durationSec);
    }
    return pts;
  }, [dur, sceneSpans, comp.blocks]);
  const snap = useCallback(
    (sec: number, exclude?: number[]) => {
      const tol = SNAP_PX / pps;
      let best = sec;
      let bestD = tol;
      let hit: number | null = null;
      for (const p of [...snapPoints, playhead.get()]) {
        if (exclude?.some((e) => Math.abs(e - p) < 1e-3)) continue;
        const d = Math.abs(p - sec);
        if (d < bestD) {
          bestD = d;
          best = p;
          hit = p;
        }
      }
      setGuide(hit); // hit a snap point -> light up the alignment guide
      return Math.round(best * 100) / 100;
    },
    [snapPoints, pps],
  );

  // Content layer's left edge (changes with scroll); recompute each frame while dragging
  const contentLeft = () => contentRef.current?.getBoundingClientRect().left ?? 0;
  const secAt = (clientX: number) => Math.max(0, Math.min(dur, (clientX - contentLeft()) / pps));
  /** Shared marquee engine (scene track / element track): anchor in content coordinates (base moves with scroll, x0/y0 stay fixed in content coords),
   *  end point recomputed each frame from base's **live** rect -> supports edge auto-scroll throughout; keeps scrolling via rAF even when the pointer sits still at the edge.
   *  baseRef = coordinate-base DOM; draggedRef = whether it became a drag; onDrag = draw rectangle; onCommit = hit test; onClick = pure click (no drag). */
  const startMarquee = (
    e: React.PointerEvent,
    baseRef: React.MutableRefObject<HTMLDivElement | null>,
    draggedRef: React.MutableRefObject<boolean>,
    onDrag: (x0: number, y0: number, x1: number, y1: number) => void,
    onCommit: (x0: number, y0: number, x1: number, y1: number) => void,
    onEnd: () => void,
    onClick?: (clientX: number) => void,
  ) => {
    if (e.button !== 0) return;
    const base = baseRef.current;
    if (!base) return;
    const rect0 = base.getBoundingClientRect();
    const x0 = e.clientX - rect0.left; // content coords: scroll doesn't change it (base moves but the content point stays fixed)
    const y0 = e.clientY - rect0.top;
    draggedRef.current = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let px1 = NaN;
    let py1 = NaN;
    const EDGE = 44; // viewport-edge band width that triggers auto-scroll (px)
    const frame = () => {
      const sc = scrollRef.current;
      if (sc) {
        const sr = sc.getBoundingClientRect();
        let dx = 0;
        if (lastX < sr.left + EDGE) dx = -Math.ceil(((sr.left + EDGE - lastX) / EDGE) * 20);
        else if (lastX > sr.right - EDGE) dx = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 20);
        if (dx) sc.scrollLeft += dx; // at the edge: keep horizontal-scrolling (base moves with it, and recomputing the end point extends into the new area)
      }
      const r = base.getBoundingClientRect(); // live rect (includes scroll offset)
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (!draggedRef.current && (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4)) draggedRef.current = true;
      if (draggedRef.current && (x1 !== px1 || y1 !== py1)) {
        px1 = x1;
        py1 = y1;
        onDrag(x0, y0, x1, y1); // only setState when the rectangle actually changed (changes each frame during edge scroll, unchanged when still)
      }
      marqueeRafRef.current = requestAnimationFrame(frame);
    };
    marqueeRafRef.current = requestAnimationFrame(frame);
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      cancelAnimationFrame(marqueeRafRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r = base.getBoundingClientRect();
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (draggedRef.current) onCommit(x0, y0, x1, y1);
      else onClick?.(lastX);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** Scene-track marquee: drag a rectangle from the track's **top/bottom gap** (or the blank right of the last card); matched shots all enter the multi-select set.
   *  Pressing on a card is intercepted by the card itself for reorder (startShotDrag); the two gestures split by start point, like CapCut. */
  const onLanePointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      laneRef,
      marqueeDraggedRef,
      (x0, _y0, x1) => setMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1) }),
      (x0, _y0, x1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        onBoxSelectShots(sceneSpans.filter(({ start, end }) => x(start) < hi && x(end) > lo).map(({ shot }) => shot.id));
      },
      () => setMarquee(null),
    );
  };
  // Image/video/element drags all make the timeline a drop zone; drop routing splits by type (see assetDragKind comment)
  const dropActive = !!assetDragging && !!assetDragKind;
  /** Whether the drop/hover is on the main track (filmstrip / scene card row) — decides "insert clip" vs "insert block at drop point". */
  const onMainTrack = (e: { target: EventTarget | null }) => !!(e.target as Element | null)?.closest?.('[data-main-track]');
  /** Is this type allowed to drop in this area: main track takes image/video (as clips), overlay area takes image/element (as blocks). */
  const dropAllowed = (clip: boolean) => (assetDragKind === 'audio' ? true : clip ? assetDragKind !== 'element' : assetDragKind !== 'video');
  // On drag end (released outside the timeline / cancelled) clear the marker
  useEffect(() => {
    if (!assetDragging) setDropHint(null);
  }, [assetDragging]);

  // Generic pointer drag (returns whether it actually dragged -> distinguishes click vs drag). Runs a continuous rAF loop:
  // onMove fires at most once per frame (seeking the video on every pointermove is expensive decoding-wise and causes jank),
  // and at the viewport's left/right edge it keeps auto horizontal-scrolling (same rAF pattern as shot reorder / marquee) —
  // the scroll shifts the content coordinate base, so scrolled frames replay onMove even with the pointer sitting still,
  // which is what lets a playhead/trim drag keep advancing past the visible window. draggingRef makes hover-seek yield.
  const drag = (e: React.PointerEvent, onMove: (clientX: number, clientY: number) => void, onUp?: (moved: boolean) => void) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // keep receiving move/up even outside the window
    } catch {
      /* fall back to buttons */
    }
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let dirty = false; // pointer moved since last flushed frame
    let raf = 0;
    draggingRef.current = true;
    const EDGE = 44; // viewport-edge band width that triggers auto-scroll (same as marquee/shot reorder)
    const frame = () => {
      const sc = scrollRef.current;
      let scrolled = false;
      if (sc && moved) {
        const sr = sc.getBoundingClientRect();
        const leftEdge = sr.left + GUTTER + EDGE; // left is covered by the sticky gutter; visible content starts at +GUTTER
        let d = 0;
        if (lastX < leftEdge) d = -Math.ceil(((leftEdge - lastX) / EDGE) * 44);
        else if (lastX > sr.right - EDGE) d = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 44);
        if (d) {
          const before = sc.scrollLeft;
          sc.scrollLeft += d;
          scrolled = sc.scrollLeft !== before; // at scroll bounds nothing changed -> don't replay onMove every frame
        }
      }
      if (moved && (dirty || scrolled)) {
        dirty = false;
        onMove(lastX, lastY);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; } // missed pointerup: finish immediately, don't track bare movement
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true; // pure vertical (cross-track) also counts as a drag
      lastX = ev.clientX;
      lastY = ev.clientY;
      dirty = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      setGuide(null); // drag ended, hide the guide
      draggingRef.current = false;
      onUp?.(moved);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Cmd + wheel zoom (zoom value is controlled by the transport slider)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      onPps((p) => Math.max(MIN_PPS, Math.min(MAX_PPS, p * (ev.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onPps]);

  // Auto-scroll to follow the playhead during playback: page-scroll when it leaves the viewport (land the playhead at ~10% from the visible content's left, leaving lead-in).
  // User manual scroll during playback -> stop following, until next play re-enables it (followRef resets on the playing rising edge).
  const followRef = useRef(true);
  const progScrollUntilRef = useRef(0); // time window for programmatic scrolls: scroll events within it don't count as user action
  /** Scroll so the playhead lands at leadFrac of the visible content width (0.1 = left lead-in for follow; 0.5 = center it). */
  const scrollToPlayhead = useCallback(
    (leadFrac: number) => {
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      // Content layer's left edge in scroll coordinates (computed via rect, no offsetParent dependency)
      const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const px = contentX + playhead.get() * pps;
      const target = px - GUTTER - (el.clientWidth - GUTTER) * leadFrac;
      progScrollUntilRef.current = performance.now() + 150;
      el.scrollLeft = Math.max(0, target);
    },
    [pps],
  );
  useEffect(() => {
    if (playing) followRef.current = true; // playback started: restart following
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    let lastCheck = 0;
    const follow = () => {
      if (!followRef.current) return;
      // 4Hz is enough for the out-of-viewport check: the playhead fires every frame, and calling getBoundingClientRect every frame here would force a synchronous layout each frame, fighting the engine's rAF for the main thread (one contributor to transition stutter)
      const now = performance.now();
      if (now - lastCheck < 250) return;
      lastCheck = now;
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const px = contentX + playhead.get() * pps;
      const visLeft = el.scrollLeft + GUTTER; // left is covered by the sticky gutter; visible content starts at +GUTTER
      const visRight = el.scrollLeft + el.clientWidth;
      if (px < visLeft || px > visRight - 8) scrollToPlayhead(0.1);
    };
    const unsub = playhead.subscribe(follow);
    follow(); // correct once at play start
    return unsub;
  }, [playing, pps, scrollToPlayhead]);
  // Click transport time readout -> center on the playhead (triggered by incrementing locateSignal; skip first mount)
  const scrollToPlayheadRef = useRef(scrollToPlayhead);
  scrollToPlayheadRef.current = scrollToPlayhead;
  const firstLocateRef = useRef(true);
  useEffect(() => {
    if (firstLocateRef.current) {
      firstLocateRef.current = false;
      return;
    }
    scrollToPlayheadRef.current(0.5);
  }, [locateSignal]);
  const lastScrollLeftRef = useRef(0);
  const onScrollFollow = () => {
    const el = scrollRef.current;
    if (!el) return;
    const moved = el.scrollLeft !== lastScrollLeftRef.current; // only count horizontal scroll (vertical track-switch doesn't count)
    lastScrollLeftRef.current = el.scrollLeft;
    if (performance.now() < progScrollUntilRef.current) return; // programmatic scroll, ignore
    if (playing && moved) followRef.current = false; // user horizontal manual scroll during playback -> stop following
  };

  // Representative kind per track (take that track's first block); track 0 = video
  const trackKind = (track: number): BlockKind | 'video' => {
    if (track === 0) return 'video';
    const b = comp.blocks.find((bk) => bk.trackIndex === track);
    return b ? blockKind(b) : 'custom';
  };

  const step = rulerStep(pps);
  const ticks = Math.floor(dur / step) + 1;

  // Track 0 = scene rail (taller when there's video); per-track height/offset.
  // **Display order != track-number order**: overlay tracks sort by descending z (NLE convention, upper rows cover lower ones),
  // captions (track 1, lowest z) naturally land at the bottom; gutter drag-reorder = recomputing z (onReorderTracks).
  const sceneRail = !!comp.video;
  const H0 = sceneRail ? SCENE_H : ROW_H;
  // Only open a row for tracks that actually have non-caption blocks: sentence captions don't enter the timeline (pure computed output), and empty tracks no longer render empty rows
  const overlayTracks = useMemo(() => {
    const set = new Set<number>();
    for (const b of comp.blocks) if (b.trackIndex > 0 && !isSentenceCaption(b)) set.add(b.trackIndex);
    return [...set].sort((a, b) => b - a);
  }, [comp.blocks]);
  // Sentence captions get their own read-only "caption lane" (follows the transcript, no drag/trim, edited from the caption panel), always at the bottom
  const captionBlocks = useMemo(
    () => comp.blocks.filter(isSentenceCaption).sort((a, b) => a.startSec - b.startSec),
    [comp.blocks],
  );
  const hasCaptions = captionBlocks.length > 0;
  const displayTracks = useMemo(
    () => (hasCaptions ? [0, ...overlayTracks, CAP_LANE] : [0, ...overlayTracks]),
    [overlayTracks, hasCaptions],
  );
  const dispIdx = useMemo(() => new Map(displayTracks.map((tk, i) => [tk, i])), [displayTracks]);
  const rowH = (track: number) => (track === 0 ? H0 : ROW_H);
  const rowTop = (track: number) => {
    const di = dispIdx.get(track) ?? 0;
    return di === 0 ? 0 : H0 + ROW_GAP + (di - 1) * (ROW_H + ROW_GAP);
  };
  const slotTop = (slot: number) => (slot === 0 ? 0 : H0 + ROW_GAP + (slot - 1) * (ROW_H + ROW_GAP));
  const tracksH = slotTop(displayTracks.length - 1) + (displayTracks.length > 1 ? ROW_H : H0);
  // Music lane: a dedicated bottom row — shown when clips exist, or as a highlighted drop target while an audio asset is being dragged
  const audioClips = comp.audioTracks ?? [];
  const musicLane = audioClips.length > 0 || assetDragKind === 'audio';
  // Live gesture on a music chip: kept LOCAL so a drag re-renders only this component — writing comp per
  // pointer frame re-rendered the whole workbench and re-specced the audio engine (that was the stutter),
  // while painting the DOM by hand fought React for the same left/width props (that was the "not live").
  // The same values are committed once on release, so nothing shifts when the drag ends.
  const [audioDrag, setAudioDrag] = useState<{ id: string; patch: Partial<AudioClip> } | null>(null);
  const musicTop = tracksH + ROW_GAP;
  const tracksHWithMusic = musicLane ? musicTop + AUDIO_ROW_H : tracksH;

  /** Element-track marquee: drag a rectangle over empty element-track space (can span tracks); matched blocks all enter the multi-select set.
   *  Coordinate base tracksRef; x shares the domain of x(start), y that of rowTop. Pure click = clear selection + move playhead to the click point. */
  const onOverlayPointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      tracksRef,
      blockMarqueeDraggedRef,
      (x0, y0, x1, y1) => setBlockMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) }),
      (x0, y0, x1, y1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const top = Math.min(y0, y1);
        const bot = Math.max(y0, y1);
        const hit = comp.blocks
          .filter((b) => b.trackIndex > 0 && !isSentenceCaption(b))
          .filter((b) => {
            const bl = x(b.startSec);
            const br = x(b.startSec + b.durationSec);
            const bt = rowTop(b.trackIndex) + 4;
            const bb = bt + (ROW_H - 8);
            return bl < hi && br > lo && bt < bot && bb > top; // intersect on both timeline x and track y
          })
          .map((b) => b.id);
        onBoxSelectBlocks(hit);
      },
      () => setBlockMarquee(null),
      (clientX) => {
        onSelect(null);
        onSeek(secAt(clientX));
      },
    );
  };

  // Gutter drag-reorder: the dragged row follows via translateY, the target slot draws an insert line, release commits the new display order
  const [trackDrag, setTrackDrag] = useState<{ track: number; fromSlot: number; toSlot: number; dy: number } | null>(null);
  const trackDragRef = useRef(trackDrag);
  trackDragRef.current = trackDrag;
  const startTrackDrag = (e: React.PointerEvent, track: number) => {
    if (overlayTracks.length <= 1) return; // only one overlay track, nothing to reorder (caption lane doesn't count)
    e.preventDefault();
    const fromSlot = dispIdx.get(track)!;
    const sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; }
      const dy = ev.clientY - sy;
      // Clamp the upper bound to the last real overlay track (= overlayTracks.length); the caption lane's slot rejects drops
      const toSlot = Math.max(1, Math.min(overlayTracks.length, fromSlot + Math.round(dy / (ROW_H + ROW_GAP))));
      setTrackDrag({ track, fromSlot, toSlot, dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const td = trackDragRef.current;
      setTrackDrag(null);
      if (td && td.toSlot !== td.fromSlot) {
        const order = overlayTracks.slice(); // overlay tracks top-to-bottom (excludes caption lane)
        const [moved] = order.splice(td.fromSlot - 1, 1);
        order.splice(td.toSlot - 1, 0, moved!);
        onReorderTracks(order);
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Scene card drag-reorder (like CapCut): drag from the **card** = reorder, drag from the track's top/bottom gap = marquee (onLanePointerDown).
  // The dragged card follows via translateX, the target seam draws an insert line, release commits the new order; <4px isn't a drag, so the click passes through.
  // Same rAF loop as the marquee engine: keep auto horizontal-scrolling at the viewport edge, displacement computed in content coords (doesn't drift with scroll).
  const [shotDrag, setShotDrag] = useState<{ from: number; to: number; dx: number } | null>(null);
  const shotDragRef = useRef(shotDrag);
  shotDragRef.current = shotDrag;
  const shotDragMovedRef = useRef(false); // whether this press became a drag (suppress the subsequent click)
  const startShotDrag = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0 || !onReorderShot || sceneSpans.length <= 1) return;
    e.preventDefault();
    const x0 = e.clientX - contentLeft(); // content-coordinate start (scroll doesn't change it)
    const mid0 = (x(sceneSpans[from]!.start) + x(sceneSpans[from]!.end)) / 2;
    const mids = sceneSpans.map((sp) => (x(sp.start) + x(sp.end)) / 2);
    shotDragMovedRef.current = false;
    let lastX = e.clientX;
    let raf = 0;
    const frame = () => {
      const sc = scrollRef.current;
      if (sc && shotDragMovedRef.current) {
        const sr = sc.getBoundingClientRect();
        const EDGE = 44;
        let d = 0;
        if (lastX < sr.left + EDGE) d = -Math.ceil(((sr.left + EDGE - lastX) / EDGE) * 20);
        else if (lastX > sr.right - EDGE) d = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 20);
        if (d) sc.scrollLeft += d;
      }
      const dx = lastX - contentLeft() - x0;
      if (shotDragMovedRef.current || Math.abs(dx) > 4) {
        shotDragMovedRef.current = true;
        draggingRef.current = true; // hover-seek yields
        // Target position = how many other cards' midpoints the dragged card's center passes (i.e. the insert index after removing itself, exactly splice semantics)
        let to = 0;
        for (let j = 0; j < mids.length; j++) if (j !== from && mid0 + dx > mids[j]!) to += 1;
        const cur = shotDragRef.current;
        if (!cur || cur.dx !== dx || cur.to !== to) setShotDrag({ from, to, dx });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) {
        up();
        return;
      }
      lastX = ev.clientX;
    };
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      draggingRef.current = false;
      const sd = shotDragRef.current;
      setShotDrag(null);
      if (sd && shotDragMovedRef.current && sd.to !== sd.from) onReorderShot(sd.from, sd.to);
      // click fires synchronously after pointerup, so keep the flag for it to suppress the click; releasing outside the card has no click, so reset on the next tick as a fallback
      setTimeout(() => {
        shotDragMovedRef.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Block cross-track drag: while dragging, the pointer landing in an element track row's core band = snap to row (to), landing in a row gap = spawn a new track (gap = insert position, draws a horizontal insert line); horizontal move stays live, release commits. Only one of to/gap is ever set.
  const [blockTrackDrag, setBlockTrackDrag] = useState<{ id: string; to: number | null; gap: number | null } | null>(null);
  const blockTrackDragRef = useRef(blockTrackDrag);
  blockTrackDragRef.current = blockTrackDrag;

  return (
    <div className="border-line bg-panel flex max-h-96 min-h-0 flex-col border-t">
      {/* Scroll area (zoom controls moved to the transport toolbar above). When a panel asset is dragged in, the whole area becomes a drop zone:
          the drop x is converted to time via secAt (includes scroll/zoom), and workbench inserts an asset block at that time */}
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto ${dropActive ? 'ring-accent/60 ring-2 ring-inset' : ''}`}
        onScroll={onScrollFollow}
        onDragOver={
          dropActive
            ? (e) => {
                e.preventDefault();
                const clip = onMainTrack(e);
                // Type not allowed in this area: no marker and no drop (don't draw a false promise)
                if (!dropAllowed(clip)) {
                  e.dataTransfer.dropEffect = 'none';
                  setDropHint(null);
                  return;
                }
                e.dataTransfer.dropEffect = 'copy';
                // Insert marker follows the cursor (0.1s quantized to debounce); dropping on the main track = insert a clip (the real insert snaps to split points)
                setDropHint({ t: Math.round(secAt(e.clientX) * 10) / 10, clip });
              }
            : undefined
        }
        onDragLeave={
          dropActive
            ? (e) => {
                // dragleave bubbles from children (fires when dragging over a scene card): only clear the marker when truly leaving the container
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropHint(null);
              }
            : undefined
        }
        onDrop={
          dropActive
            ? (e) => {
                e.preventDefault();
                setDropHint(null);
                const clip = onMainTrack(e);
                if (!dropAllowed(clip)) return;
                if (assetDragKind === 'audio') onDropAssetAudio?.(secAt(e.clientX));
                else if (clip) onDropAssetClip?.(secAt(e.clientX));
                else onDropAsset?.(secAt(e.clientX));
              }
            : undefined
        }
      >
        <div className="flex" style={{ minWidth: GUTTER + EDGE_PAD * 2 + W }}>
          {/* Left: track labels (icon + name). Sticky fixed column; z must beat all scrolling content (treatment badge z-30 /
              playhead z-30 / marquee & "+" z-40), otherwise on horizontal scroll content slides under it but covers the icons */}
          <div className="bg-panel sticky left-0 z-50 shrink-0" style={{ width: GUTTER }}>
            <div className="border-line border-b" style={{ height: RULER_H }} />
            <div style={{ paddingTop: 0 }}>
              {displayTracks.map((track) => {
                const k = trackKind(track);
                const meta =
                  track === CAP_LANE
                    ? KIND_META.caption
                    : k === 'video'
                      ? { label: sceneRail ? t('panels.scene') : t('panels.video'), icon: Film, dot: 'text-accent' }
                      : KIND_META[k];
                const Icon = meta.icon;
                const dragging = trackDrag?.track === track;
                return (
                  <div
                    key={track}
                    onPointerDown={track > 0 ? (e) => startTrackDrag(e, track) : undefined}
                    title={track > 0 ? t('panels.dragReorderTrackStacking') : undefined}
                    className={`flex items-center gap-1.5 px-2.5 text-[11px] ${track > 0 ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'bg-panel-2 relative z-10 rounded' : ''}`}
                    style={{ height: rowH(track), marginTop: track === 0 ? 0 : ROW_GAP, transform: dragging ? `translateY(${trackDrag!.dy}px)` : undefined }}
                  >
                    <Icon size={13} className={meta.dot} />
                  </div>
                );
              })}
              {musicLane && (
                <div className="flex items-center gap-1.5 px-2.5 text-[11px]" style={{ height: AUDIO_ROW_H, marginTop: ROW_GAP }}>
                  <Music size={13} className="text-accent" />
                </div>
              )}
            </div>
          </div>

          {/* Breathing room: the first block's selection ring bleeds 2px left; without it, it slips under the sticky gutter and gets clipped (same on the right, see trailing spacer) */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />

          {/* Right: ruler + tracks + playhead */}
          <div
            ref={contentRef}
            className="relative select-none"
            style={{ width: W }}
            onClick={() => {
              // Click empty space = clear all selection. Interactive parts (shots/chips/ticks/buttons) each stopPropagation,
              // so what bubbles here is the background. A marquee drag's tail isn't a click (browsers usually don't fire click, but add a safeguard).
              if (marqueeDraggedRef.current || blockMarqueeDraggedRef.current) {
                marqueeDraggedRef.current = false;
                blockMarqueeDraggedRef.current = false;
                return;
              }
              onDeselectAll();
            }}
            onMouseMove={(e) => {
              if (draggingRef.current) return; // during drag onSeek handles it, don't also hover-seek
              hoverXRef.current = e.clientX;
              if (!scrubArmedRef.current) {
                const a = scrubEnterRef.current;
                if (!a) scrubEnterRef.current = { x: e.clientX, y: e.clientY, ts: performance.now() };
                else if (performance.now() - a.ts >= 160 && Math.hypot(e.clientX - a.x, e.clientY - a.y) >= 6) {
                  scrubArmedRef.current = true;
                  // Armed → arm the escape guards too. A single mouseleave is NOT a reliable end-of-hover signal
                  // (fast flick out of the window / drag hand-offs can skip it — verified on prod: a missed leave
                  // leaves the preview frozen at the hover moment, captions from the hovered time lingering over
                  // the resting playhead). Guards are idempotent with onMouseLeave: whoever fires first restores.
                  const host = e.currentTarget as HTMLElement;
                  const guard = (ev: MouseEvent) => {
                    const r = host.getBoundingClientRect();
                    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) return;
                    endScrubRef.current();
                  };
                  const end = () => endScrubRef.current();
                  document.addEventListener('mousemove', guard);
                  window.addEventListener('blur', end);
                  document.documentElement.addEventListener('mouseleave', end);
                  scrubGuardCleanupRef.current = () => {
                    document.removeEventListener('mousemove', guard);
                    window.removeEventListener('blur', end);
                    document.documentElement.removeEventListener('mouseleave', end);
                  };
                }
              }
              if (!hoverRaf.current)
                hoverRaf.current = requestAnimationFrame(() => {
                  hoverRaf.current = 0;
                  const tt = secAt(hoverXRef.current);
                  setHoverT(tt); // hover line, instant feedback
                  if (scrubArmedRef.current) onScrub(tt); // only follow after armed: at most once per frame, center preview jumps frames
                });
            }}
            onMouseLeave={() => endScrubRef.current()}
          >
            {/* Ruler (click/drag to seek) + major/minor ticks */}
            <div
              className="border-line text-ink-4 relative cursor-ew-resize select-none border-b text-[9px]"
              style={{ height: RULER_H }}
              onClick={(e) => e.stopPropagation()} // dragging the ruler to seek doesn't clear selection
              onPointerDown={(e) => {
                onSeek(secAt(e.clientX));
                drag(e, (cx) => onSeek(secAt(cx)));
              }}
            >
              {Array.from({ length: ticks }, (_, i) => {
                const s = i * step;
                return (
                  <div key={i} className="absolute bottom-0 top-0" style={{ left: x(s) }}>
                    <div className="bg-line absolute bottom-0 left-0 w-px" style={{ height: 6 }} />
                    <span className="text-ink-4 absolute left-1 top-0.5 tabular-nums">{fmtTick(s)}</span>
                    {/* Minor tick (half cell) */}
                    {x(step) >= 40 && <div className="bg-line/60 absolute bottom-0 w-px" style={{ left: x(step) / 2, height: 3 }} />}
                  </div>
                );
              })}
            </div>

            {/* Track background area (hosts all rows) */}
            <div ref={tracksRef} className="relative" style={{ height: tracksHWithMusic }}>
              {/* Row background */}
              {displayTracks.map((track) => (
                <div
                  key={`bg${track}`}
                  data-track-row
                  className="bg-panel-2/40 absolute left-0 right-0 rounded"
                  style={{ top: rowTop(track), height: rowH(track) }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    // Element track (track>0) blank: start marquee (drag = marquee, click = deselect + seek); track 0 = scene rail handled by laneRef
                    if (track > 0) onOverlayPointerDown(e);
                    else {
                      onSelect(null);
                      onSeek(secAt(e.clientX));
                    }
                  }}
                />
              ))}
              {/* Element-track marquee rectangle (can span tracks, includes y bounds) */}
              {blockMarquee && (
                <div
                  className="pointer-events-none absolute z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                  style={{ left: blockMarquee.l, top: blockMarquee.t, width: Math.max(1, blockMarquee.r - blockMarquee.l), height: Math.max(1, blockMarquee.b - blockMarquee.t) }}
                />
              )}
              {/* Track reorder insert line (during gutter drag) */}
              {trackDrag && trackDrag.toSlot !== trackDrag.fromSlot && (
                <div
                  className="bg-accent/90 pointer-events-none absolute left-0 right-0 z-40 h-0.5 rounded"
                  style={{ top: slotTop(trackDrag.toSlot) - (trackDrag.toSlot > trackDrag.fromSlot ? -ROW_H - 2 : 4) }}
                />
              )}

              {/* Track 0 = scene rail: filmstrip base + scene cards (shot slices). Hover a shot card -> "+" at both ends to insert a local video */}
              {comp.video && (
                <div ref={laneRef} data-main-track onPointerDown={onLanePointerDown} className="absolute left-0 right-0" style={{ top: 0, height: H0 }} onMouseLeave={() => setHoverBounds(null)}>
                  {/* Filmstrip base fill (fixed tile width, nearest source frame; like cloud editors). Not filled when there are scene cards —
                      the filmstrip gets clipped inside each card; otherwise the continuous base leaks through the cards' transparent rounded corners, hiding the corners/gaps */}
                  {sceneSpans.length === 0 && (
                    <div className="bg-ink/10 pointer-events-none absolute top-3 bottom-2 left-0 overflow-hidden rounded ring-1 ring-white/10" style={{ width: x(videoDur) }}>
                      {filmTiles.map((tl, i) => (
                        // max-w-none: preflight's img max-width:100% is relative to the container, so a narrow card would squeeze tiles thin and expose gaps (same for all three tile spots)
                        <img key={i} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                      ))}
                      {(filmstrip ?? []).length === 0 && <div className="h-full w-full bg-gradient-to-r from-accent/20 to-accent/8" />}
                    </div>
                  )}
                  {/* Scene cards (shot clips, semi-transparent so the filmstrip shows through): index + current-scene highlight + treatment tag */}
                  {/* Highlight ring for the scene under the playhead: subscribes to the playhead separately, so playback no longer re-renders the whole table */}
                  <ActiveSceneRing sceneSpans={sceneSpans} pps={pps} selectedShotIds={selectedShotIds} />
                  {marquee && (
                    <div
                      className="pointer-events-none absolute top-3 bottom-2 z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                      style={{ left: marquee.l, width: Math.max(1, marquee.r - marquee.l) }}
                    />
                  )}
                  {/* Reorder target-seam insert line: to<from draws at the target card's left edge, to>from at its right edge (splice semantics) */}
                  {shotDrag && shotDrag.to !== shotDrag.from && (
                    <div
                      className="bg-accent pointer-events-none absolute top-3 bottom-2 z-50 w-1 -translate-x-1/2 rounded-full shadow"
                      style={{ left: shotDrag.to < shotDrag.from ? x(sceneSpans[shotDrag.to]!.start) : x(sceneSpans[shotDrag.to]!.end) }}
                    />
                  )}
                  {sceneSpans.map(({ shot, start, end }, i) => {
                    const sel = selectedShotIds.has(shot.id);
                    const shotLen = end - start;
                    const gapR = i < sceneSpans.length - 1 ? SHOT_GAP : 0; // hairline gap off the right edge, left edge stays time-accurate
                    const w = Math.max(8, x(shotLen) - gapR);
                    const hasTreatment = shot.treatment !== 'full';
                    const dragged = shotDrag?.from === i; // this card is being drag-reordered
                    return (
                      <div key={shot.id}>
                        <button
                          type="button"
                          // Pressing on the card = enter the reorder channel (stopPropagation blocks the track's marquee; only the top/bottom gap is the marquee entry, like CapCut)
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startShotDrag(e, i);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (shotDragMovedRef.current) {
                              shotDragMovedRef.current = false; // this is the tail of a reorder drag, not a click
                              return;
                            }
                            if (marqueeDraggedRef.current) {
                              marqueeDraggedRef.current = false; // this is the tail of a marquee drag, not a click
                              return;
                            }
                            const additive = e.metaKey || e.ctrlKey;
                            if (!additive) onSeek(secAt(e.clientX)); // single select = select + playhead to click position; multi-select doesn't move the playhead
                            onSelectShot(shot.id, additive);
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onMouseEnter={() => {
                            if (draggingRef.current) return; // a reorder/trim drag sweeping over other cards: don't pop the boundary "+"
                            setHoverBounds({ l: start, r: end });
                          }}
                          title={t('panels.sceneNShotName', { n: i + 1, name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                          className={`bg-ink/10 absolute top-3 bottom-2 overflow-hidden rounded text-left ${
                            dragged ? 'shadow-xl ring-2 ring-accent brightness-110' : sel ? 'transition ring-2 ring-accent/70' : 'transition ring-1 ring-white/10 hover:ring-accent/40'
                          }`}
                          style={{ left: x(start), width: w, ...(dragged ? { transform: `translateX(${shotDrag!.dx}px)`, zIndex: 45 } : {}) }}
                        >
                          {/* Filmstrip (clipped inside the card: rounded corners / hairline gaps from the card's overflow-hidden).
                              Externally inserted clip: the main filmstrip is the main video's frames, so pasting it would be wrong — lay down its own extracted frames
                              (clipStrips, t = clip source time; before frames are extracted, show a dedicated placeholder background) */}
                          {shot.src ? (
                            <div className="pointer-events-none absolute inset-0">
                              {(() => {
                                const strip = (shot.src ? clipStrips?.[shot.src] : null) ?? [];
                                if (!strip.length) return <div className="absolute inset-0 bg-gradient-to-r from-sky-500/35 to-sky-500/15" />;
                                return stripTiles(strip, shot.srcStart, shot.srcEnd, tileDur, pps).map((tl, ti) => (
                                  <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute top-0 object-cover" style={{ left: tl.left, width: thumbW, height: filmH }} />
                                ));
                              })()}
                            </div>
                          ) : (
                            <>
                              {stripTiles(filmstrip ?? [], shot.srcStart, shot.srcEnd, tileDur, pps).map((tl, ti) => (
                                <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none pointer-events-none absolute top-0 object-cover" style={{ left: tl.left, width: thumbW, height: filmH }} />
                              ))}
                              {(filmstrip ?? []).length === 0 && <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />}
                            </>
                          )}
                          {/* The video's OWN audio, along the card's bottom edge: same dB scale as the music
                              lane, shifted by this shot's level so muting or ducking a shot shows here too. */}
                          {(() => {
                            const sp = sourcePeaks?.get(shot.src ?? 'main');
                            if (!sp || sp.durationSec <= 0 || w < 6) return null;
                            const per = sp.peaks.length / sp.durationSec;
                            const dbShift = shot.audioMuted ? WAVE_FLOOR_DB : (shot.volumeDb ?? 0);
                            return (
                              <svg
                                className={`pointer-events-none absolute inset-x-0 bottom-0 ${shot.audioMuted ? 'text-accent/30' : 'text-accent'}`}
                                style={{ height: SCENE_WAVE_H }}
                                viewBox={`0 0 ${Math.round(w)} ${SCENE_WAVE_H}`}
                                preserveAspectRatio="none"
                                aria-hidden
                              >
                                {/* same blue as the music lane: the two audio surfaces read as one material */}
                                <rect width={Math.round(w)} height={SCENE_WAVE_H} className="fill-accent/15" />
                                <path d={waveBars(sp.peaks, Math.floor(shot.srcStart * per), Math.ceil(shot.srcEnd * per), w, SCENE_WAVE_H, dbShift)} fill="currentColor" />
                              </svg>
                            );
                          })()}
                          {/* Index number */}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-semibold leading-[14px] text-white">{i + 1}</span>
                        </button>

                        {/* Treatment badge (per shot): click selects the shot -> opens the right-side treatment panel (style cards). Sits at the scene card's bottom-left.
                            Treatment always applies to the whole shot (one shot = one treatment; split to localize), and applies as set — no "merge if dwell is too short"
                            (that restraint is for LLM shot-planning, not for user manual cuts). */}
                        <div className="absolute z-30" style={{ left: x(start) + 3, bottom: SCENE_PAD_B + SCENE_WAVE_H + 2 }}>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenShotSettings(shot.id);
                            }}
                            title={t('panels.framingName', { name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                            className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium leading-[14px] shadow ${
                              hasTreatment ? 'bg-accent/90 text-white' : 'bg-black/55 text-white/80 hover:text-white'
                            }`}
                          >
                            {hasTreatment ? t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) : t('tools.set_shot_treatment.label')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Cut-point transition (content-level, mounted on the main track): unset = narrow "add" affordance; set = a
                      symmetric region centered on the cut (theme color), with handles on both sides dragging the duration symmetrically (drag one, the other mirrors; total <=4s).
                      z-30 is above scene cards, below the hover "+" (z-40) */}
                  {onOpenTransition &&
                    (() => {
                      const trs = cutTransitions(shots);
                      return sceneSpans.slice(0, -1).map(({ end }, i) => {
                        const tr = trs.find((t2) => Math.abs(t2.cut - end) < 0.05);
                        if (!tr) {
                          return (
                            <button
                              key={`tr-${i}`}
                              type="button"
                              title={t('panels.addTransition')}
                              aria-label={t('panels.addTransition')}
                              onMouseEnter={() => {
                                if (draggingRef.current) return; // don't grab hover-scrub while dragging
                                // Hovering the transition spot = clear intent: arm hover-scrub immediately, center preview jumps straight to the cut frame
                                scrubArmedRef.current = true;
                                setHoverT(end);
                                onScrub(end);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className="absolute top-3 bottom-2 z-30 flex w-3.5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-white/75 transition hover:bg-black/65 hover:text-white"
                              style={{ left: x(end) }}
                            >
                              <ArrowLeftRight size={10} />
                            </button>
                          );
                        }
                        // Live half-width while dragging (local state); handle clamped to [0.1, min(2, both sides' shot lengths)]
                        const lenPrev = sceneSpans[i]!.end - sceneSpans[i]!.start;
                        const lenSelf = sceneSpans[i + 1]!.end - sceneSpans[i + 1]!.start;
                        const maxHalf = Math.min(MAX_TRANSITION_SEC / 2, lenPrev, lenSelf);
                        const half = trDrag && Math.abs(trDrag.cut - end) < 0.05 ? trDrag.half : tr.half;
                        const handle = (side: -1 | 1) => (
                          <div
                            role="none"
                            title={t('panels.dragAdjustDurationSymmetric')}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              drag(
                                e,
                                (cx) => setTrDrag({ cut: end, half: Math.min(maxHalf, Math.max(0.1, Math.abs(secAt(cx) - end))) }),
                                (moved) => {
                                  setTrDrag((cur) => {
                                    if (moved && cur) onResizeTransition?.(tr.shotId, Math.round(cur.half * 2 * 100) / 100);
                                    return null;
                                  });
                                },
                              );
                            }}
                            className="bg-accent absolute top-0 bottom-0 w-1.5 cursor-ew-resize rounded-full opacity-80 hover:opacity-100"
                            style={side < 0 ? { left: -3 } : { right: -3 }}
                          />
                        );
                        return (
                          <div
                            key={`tr-${i}`}
                            className="absolute top-3 bottom-2 z-30"
                            style={{ left: x(end - half), width: Math.max(10, x(half * 2)) }}
                            onMouseEnter={(e) => {
                              if (draggingRef.current) return; // don't grab hover-scrub while dragging
                              // Hovering the transition region = clear intent: arm immediately, preview jumps to the cursor's time (subsequent mousemove bubbles up to follow)
                              scrubArmedRef.current = true;
                              const tt = secAt(e.clientX);
                              setHoverT(tt);
                              onScrub(tt);
                            }}
                          >
                            <button
                              type="button"
                              title={t('panels.transitionSecSClick', { sec: (half * 2).toFixed(1) })}
                              aria-label={t('panels.editTransition')}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className="bg-accent/30 ring-accent/70 hover:bg-accent/40 absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm ring-1 transition"
                            >
                              <span className="bg-accent flex h-4 w-4 items-center justify-center rounded-full text-white shadow">
                                <ArrowLeftRight size={9} />
                              </span>
                            </button>
                            {handle(-1)}
                            {handle(1)}
                          </div>
                        );
                      });
                    })()}
                  {/* "+" at the hovered shot's leading/trailing boundaries: click to insert a local video at that split point (upload -> insert into main track) */}
                  {hoverBounds && onInsertClipAt && !assetDragging && clipPendingAt == null &&
                    [hoverBounds.l, hoverBounds.r].map((b, bi) => (
                      <button
                        key={bi}
                        type="button"
                        title={t('panels.insertLocalVideoHere')}
                        aria-label={t('panels.insertLocalVideoHere')}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInsertClipAt(b);
                        }}
                        className="bg-accent absolute top-1/2 z-40 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white shadow hover:brightness-110"
                        style={{ left: x(b) }}
                      >
                        <Plus size={12} />
                      </button>
                    ))}
                </div>
              )}

              {/* Overlay element chip: type icon + label + time when selected; whole-block drag + trim at both ends */}
              {comp.blocks.map((b) => {
                const track = b.trackIndex;
                const sel = selectedBlockIds.has(b.id);
                const k = blockKind(b);
                const meta = { ...KIND_META[k], ...KIND_CHIP[k] };
                const Icon = meta.icon;
                const left = x(b.startSec);
                const width = Math.max(16, x(b.durationSec));
                // Sentence captions don't enter the timeline: captions are a pure computed output of the script (edited from the script panel / caption panel);
                // a row of chips that follow the transcript and can't be dragged or trimmed is just noise
                if (isSentenceCaption(b)) return null;
                // During cross-track drag: chip renders snapped to the target row; if it hits a row gap it rides the insert line (trackIndex only really changes on release)
                const btd = blockTrackDrag?.id === b.id ? blockTrackDrag : null;
                const crossing = !!btd && (btd.gap != null || btd.to !== track);
                const top = btd?.gap != null ? slotTop(1 + btd.gap) - ROW_GAP / 2 - (ROW_H - 8) / 2 : rowTop(btd?.to ?? track) + 4;
                return (
                  <div
                    key={b.id}
                    title={b.label}
                    className={`group absolute overflow-hidden rounded-md ring-1 ${crossing ? 'z-40 shadow-lg ring-2 brightness-110' : 'transition'} ${sel ? meta.chipSel : meta.chip}`}
                    style={{ left, width, top, height: ROW_H - 8 }}
                    onClick={(e) => e.stopPropagation()} // chip is selected via pointer; block bubbling so the background doesn't clear it
                    onMouseEnter={(e) => openHover(b, e.currentTarget)}
                    onMouseLeave={closeHover}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      closeHover();
                      onSelect(b.id); // positioning was already done by the single click (stop where you clicked); double-click no longer jumps to the block start
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      closeHover();
                      const additive = e.metaKey || e.ctrlKey; // Cmd/Ctrl multi-select
                      const at = secAt(e.clientX); // time at press point: on click the playhead stops here
                      const grab = at - b.startSec;
                      drag(
                        e,
                        (cx, cy) => {
                          if (additive) return;
                          onMoveBlock(b.id, snap(Math.max(0, secAt(cx) - grab), [b.startSec, b.startSec + b.durationSec]));
                          // Vertical: a row's core band = snap to row; a row gap (including the scene track's lower edge / caption lane's sides) = new-track insert position
                          if (!onMoveBlockTrack) return;
                          const base = tracksRef.current?.getBoundingClientRect();
                          if (!base) return;
                          const y = cy - base.top;
                          let to: number | null = null;
                          for (const tk of overlayTracks) {
                            if (y >= rowTop(tk) + 4 && y <= rowTop(tk) + ROW_H - 4) {
                              to = tk;
                              break;
                            }
                          }
                          if (to != null || !onMoveBlockNewTrack) {
                            // Missed a row's core band and new-track isn't supported: keep the last matched row
                            const prev = blockTrackDragRef.current?.id === b.id ? blockTrackDragRef.current : null;
                            setBlockTrackDrag({ id: b.id, to: to ?? prev?.to ?? track, gap: null });
                          } else {
                            let g = 0; // insert position = count of row core bands passed
                            for (const tk of overlayTracks) if (y > rowTop(tk) + ROW_H - 4) g += 1;
                            setBlockTrackDrag({ id: b.id, to: null, gap: g });
                          }
                        },
                        (moved) => {
                          const td = blockTrackDragRef.current;
                          setBlockTrackDrag(null);
                          if (moved) {
                            if (td?.id === b.id) {
                              if (td.gap != null) onMoveBlockNewTrack?.(b.id, td.gap);
                              else if (td.to != null && td.to !== track) onMoveBlockTrack?.(b.id, td.to);
                            }
                            return;
                          }
                          if (additive) {
                            onSelectBlock(b.id, true); // toggle in/out of the multi-select set, don't move the playhead
                            return;
                          }
                          // Click = select + playhead to the exact clicked position (stage shows that moment directly)
                          onSeek(at);
                          onSelectBlock(b.id, false);
                        },
                      );
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center gap-1 px-2">
                      <Icon size={11} className={`${meta.dot} shrink-0`} />
                      <span className="text-ink truncate text-[10px] font-medium">{b.label || t(meta.label)}</span>
                      {sel && width > 92 && (
                        <span className="text-ink-3 ml-auto shrink-0 font-mono text-[9px] tabular-nums">
                          {b.startSec.toFixed(1)}–{(b.startSec + b.durationSec).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {/* Left trim */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const end = b.startSec + b.durationSec;
                        drag(e, (cx) => {
                          const ns = Math.max(0, Math.min(end - MIN_DUR, snap(secAt(cx), [b.startSec])));
                          onResizeBlock(b.id, ns, end - ns);
                        });
                      }}
                      className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                    {/* Right trim */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        drag(e, (cx) => {
                          const ne = Math.max(b.startSec + MIN_DUR, snap(secAt(cx), [b.startSec + b.durationSec]));
                          onResizeBlock(b.id, b.startSec, ne - b.startSec);
                        });
                      }}
                      className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                  </div>
                );
              })}

              {/* New-track horizontal insert line (when a block is dragged into a row gap): rides the center of the gap between two rows */}
              {blockTrackDrag?.gap != null && (
                <div
                  className="bg-accent pointer-events-none absolute left-0 z-40 h-0.5 rounded-full shadow"
                  style={{ top: slotTop(1 + blockTrackDrag.gap) - ROW_GAP / 2 - 1, width: x(dur) }}
                />
              )}

              {/* Caption lane: sentence-caption chips (follow the transcript, no drag/trim; click = SELECT that caption + jump the playhead; text edited from the caption panel) */}
              {hasCaptions &&
                captionBlocks.map((b) => (
                  <div
                    key={b.id}
                    title={b.label || t('panels.captions')}
                    className="absolute overflow-hidden rounded-md bg-rose-500/12 ring-1 ring-rose-400/25 transition hover:bg-rose-500/20"
                    style={{ left: x(b.startSec), width: Math.max(10, x(b.durationSec)), top: rowTop(CAP_LANE) + 4, height: ROW_H - 8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBlock(b.id, false); // picking a concrete caption on the timeline selects it (the one place that sets caption selection outside the stage)
                      onSeek(secAt(e.clientX));
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center px-2">
                      <span className="text-ink-2 truncate text-[10px]">{b.label || t('panels.captions')}</span>
                    </div>
                  </div>
                ))}

              {/* Music lane (bottom row): one chip per audio clip, drawn with its waveform.
                  Click selects (Del removes), body-drag moves, edge handles trim in/out, and the two
                  top-corner knees drag the fades. While an audio asset is dragged the empty lane shows
                  a dashed drop strip. Overlapping clips overlap visually too (their sounds sum). */}
              {musicLane && (
                <div className="absolute right-0 left-0" style={{ top: musicTop, height: AUDIO_ROW_H }}>
                  {audioClips.map((base) => {
                    // during a gesture this clip renders from the live patch; everything below (window,
                    // wave slice, fades, knee positions) derives from it, so there is one source of truth
                    const clip = audioDrag?.id === base.id ? { ...base, ...audioDrag.patch } : base;
                    const w = audioClipWindow(clip, dur);
                    const end = Math.min(dur, w.end);
                    const contentW = x(Math.max(0.05, w.end - w.start)); // the clip's real length in px
                    const width = Math.max(14, x(Math.max(0.05, end - w.start))); // visible box (clipped at the timeline end)
                    const selected = selectedAudioId === clip.id;
                    const d = audioClipDefaults(clip);
                    const peaks = clip.sig ? audioPeaks?.get(clip.sig) : undefined;
                    const span = Math.max(0.05, w.end - w.start);
                    const knobs = width > 56; // narrow chips have no room for knees (drag the panel sliders instead)
                    // Gestures paint through the DOM and commit ONCE on release: a state write per pointer
                    // frame re-rendered the whole timeline (and re-specced the audio engine), which is what
                    // made trimming stutter. During a drag we only touch this chip's own left/width and its
                    // wave path — no React render — then a single commit lands the value. Direct-manipulation
                    // drags stay out of the undo stack (element-track convention).
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        title={clip.label || t('panels.musicBed')}
                        className={`group/aud text-ink absolute top-0.5 cursor-grab overflow-hidden rounded-md border active:cursor-grabbing ${
                          selected ? 'border-accent ring-accent/40 z-10 ring-1' : 'border-accent/40'
                        }`}
                        style={{ left: x(w.start), width, height: CHIP_H }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onSelectAudio?.(clip.id);
                            onOpenMusicPanel?.();
                          }
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          const grab = secAt(e.clientX) - w.start;
                          let at = w.start;
                          drag(
                            e,
                            (cx) => {
                              let ns = Math.max(0, Math.min(Math.max(0, dur - 0.2), snap(secAt(cx) - grab, [w.start, w.end])));
                              if (ns < 0.15) ns = 0; // snap to the head
                              at = ns;
                              setAudioDrag({ id: base.id, patch: { startSec: ns } });
                            },
                            (moved) => {
                              setAudioDrag(null);
                              onSelectAudio?.(base.id);
                              if (moved) onMoveAudio?.(base.id, at);
                              else onOpenMusicPanel?.();
                            },
                          );
                        }}
                      >
                        {/* Label strip on top; everything audio-shaped lives in the BODY below it — the same
                            split the reference editor uses, which is why its knees sit in a lane instead of on
                            the chip's corner. */}
                        <div
                          className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 px-1.5 ${selected ? 'bg-accent/25' : 'bg-accent/15'}`}
                          style={{ height: CHIP_LABEL_H }}
                        >
                          <Music size={9} className="text-accent shrink-0" />
                          <span className="text-ink-2 truncate text-[9.5px] leading-none">{clip.label || t('panels.musicBed')}</span>
                          {d.speed !== 1 && (
                            <span className="text-ink-3 bg-panel/70 shrink-0 rounded px-1 text-[9px] leading-[12px] tabular-nums">{d.speed.toFixed(2).replace(/0$/, '')}×</span>
                          )}
                        </div>
                        {/* Body svg is 1:1 with pixels (no viewBox stretching, so nothing gets squashed) and
                            spans the clip's TRUE content width, so the chip crops it: dragging an edge reveals
                            or hides the wave instead of rescaling it. */}
                        <svg
                          className="pointer-events-none absolute left-0"
                          style={{ top: CHIP_LABEL_H, width: contentW, height: CHIP_BODY_H }}
                          viewBox={`0 0 ${Math.round(contentW)} ${CHIP_BODY_H}`}
                          aria-hidden
                        >
                          {/* body background tapering along the fade, then the wave on top of it */}
                          <path d={audioBodyPath(d, contentW, span)} className={selected ? 'text-accent/25' : 'text-accent/15'} fill="currentColor" />
                          {peaks && peaks.length > 1 && <path d={audioWaveBars(peaks, clip, d, contentW, span)} className="text-accent" fill="currentColor" />}
                        </svg>
                        {/* Trim handles: the edge follows the pointer 1:1, painted through the DOM. On a left
                            trim the wave is nudged the other way so the audio stays pinned to the timeline —
                            dragging reveals or hides it, it never slides. */}
                        {(['left', 'right'] as const).map((edge) => (
                          <span
                            key={edge}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              let patch = audioTrimPatch(base, edge, edge === 'left' ? w.start : w.end);
                              drag(
                                e,
                                (cx) => {
                                  // always measured off the ORIGINAL clip, so the edge tracks the pointer
                                  // without accumulating rounding from the live preview
                                  patch = audioTrimPatch(base, edge, Math.max(0, snap(secAt(cx), [w.start, w.end])));
                                  setAudioDrag({ id: base.id, patch });
                                },
                                (moved) => {
                                  setAudioDrag(null);
                                  onSelectAudio?.(base.id);
                                  if (moved) onTrimAudio?.(base.id, patch);
                                },
                              );
                            }}
                            className={`absolute inset-y-0 w-1.5 cursor-ew-resize ${edge === 'left' ? 'left-0 rounded-l' : 'right-0 rounded-r'} ${
                              selected ? 'bg-white/50' : 'bg-white/0 group-hover/aud:bg-white/40'
                            }`}
                          />
                        ))}
                        {/* Fade knees: small squares in the fade lane, sitting on the ramp's top vertex, with a
                            diagonal glyph pointing the way the ramp runs. The wedge is always drawn — only the
                            grabs are hover/selected (14px hit area around an 8px glyph). */}
                        {knobs &&
                          (['in', 'out'] as const).map((edge) => {
                            const kx = audioKneeX(edge === 'in' ? d.fadeInSec : d.fadeOutSec, edge, contentW, span);
                            return (
                              <span
                                key={edge}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  let sec = edge === 'in' ? d.fadeInSec : d.fadeOutSec;
                                  drag(
                                    e,
                                    (cx) => {
                                      const raw = edge === 'in' ? secAt(cx) - w.start : w.end - secAt(cx);
                                      sec = Math.round(Math.max(0, Math.min(span, AUDIO_FADE_MAX_SEC, raw)) * 10) / 10;
                                      setAudioDrag({ id: base.id, patch: edge === 'in' ? { fadeInSec: sec } : { fadeOutSec: sec } });
                                    },
                                    (moved) => {
                                      setAudioDrag(null);
                                      onSelectAudio?.(base.id);
                                      if (moved) onFadeAudio?.(base.id, edge, sec);
                                    },
                                  );
                                }}
                                title={t(edge === 'in' ? 'panels.fadeIn' : 'panels.fadeOut')}
                                className={`absolute z-10 flex cursor-ew-resize items-center justify-center transition-opacity ${selected ? '' : 'opacity-0 group-hover/aud:opacity-100'}`}
                                style={{ left: kx - 7, top: CHIP_LABEL_H + KNEE_LANE_Y - 7, width: 14, height: 14 }}
                              >
                                <span
                                  className="border-accent block rounded-full border-2 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                                  style={{ width: KNEE_SIZE, height: KNEE_SIZE }}
                                />
                              </span>
                            );
                          })}
                      </div>
                    );
                  })}
                  {audioClips.length === 0 && (
                    <div className="border-accent/50 text-accent absolute inset-x-0 top-0.5 bottom-0.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed text-[10px]">
                      <Music size={11} /> {t('panels.dropAudioHere')}
                    </div>
                  )}
                </div>
              )}

              {/* Snap alignment guide (when a drag hits a cut point / whole second / adjacent block edge / playhead) */}
              {guide != null && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(guide) }}>
                  <div className="absolute top-0 bottom-0 w-px bg-accent/90" style={{ boxShadow: '0 0 6px rgba(63,75,232,0.55)' }} />
                  <div className="absolute -top-0.5 left-1 rounded bg-accent px-1 font-mono text-[9px] leading-[13px] text-white">{guide.toFixed(2)}s</div>
                </div>
              )}

              {/* Asset-drag insert-point marker: follows the cursor — what you see is where it inserts; hovering the main track = insert-clip mode */}
              {dropActive && dropHint != null && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(dropHint.t) }}>
                  <div className="bg-accent absolute top-0 bottom-0 w-0.5 -translate-x-1/2" style={{ boxShadow: '0 0 8px rgba(63,75,232,0.7)' }} />
                  <div className="bg-accent absolute -top-0.5 left-1.5 rounded px-1 text-[9px] leading-[13px] whitespace-nowrap text-white">
                    {dropHint.clip ? t('panels.bRollModeSec', { mode: assetDragKind === 'image' ? t('panels.still5s') : t('panels.fullClip'), sec: dropHint.t.toFixed(1) }) : t('panels.insertSecS', { sec: dropHint.t.toFixed(1) })}
                  </div>
                </div>
              )}

              {/* External clip insert in progress (download/upload/reading duration): show a badge at the drop point so it doesn't look like the drag did nothing */}
              {clipPendingAt != null && (
                <div className="pointer-events-none absolute z-40 -translate-x-1/2" style={{ left: x(clipPendingAt), top: 8 }}>
                  <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white">
                    <Loader2 size={10} className="animate-spin" /> {t('common.inserting')}
                  </span>
                </div>
              )}

            </div>

            {/* Hover vertical line (spans ruler + tracks; center preview jumps to that frame in sync) */}
            {hoverT != null && <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white/35" style={{ left: x(hoverT) }} />}

            {/* Playhead: spans ruler + tracks, bright line + top dot (subscribes to the playhead store, only this component moves each frame).
                Not drawn on an empty project — a red line hanging on empty tracks looks broken */}
            {(comp.video || comp.blocks.length > 0) && <PlayheadCursor pps={pps} />}
          </div>

          {/* Right breathing room: the last block's selection ring bleed isn't clipped by the scroll container's right edge */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />
        </div>
      </div>


      {/* Hover element preview (fixed screen coords, floats above the chip) */}
      {hover && (
        <div
          className="border-line bg-panel pointer-events-none fixed z-50 overflow-hidden rounded-lg border shadow-2xl"
          style={{
            left: Math.max(8, Math.min(hover.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - PREVIEW_W - 8 - 2)),
            top: hover.top - previewH - 10,
            width: PREVIEW_W + 2,
          }}
        >
          <div
            className="relative"
            style={{
              width: PREVIEW_W,
              height: previewH,
              // Transparency checkerboard (screen pixels; same as block-preview-card, drawing it into the scaled doc would blur it)
              backgroundColor: '#ffffff',
              backgroundImage:
                'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,8px 8px',
            }}
          >
            <iframe
              title="element-preview"
              srcDoc={hoverDoc}
              sandbox="allow-scripts"
              style={{
                position: 'absolute',
                left: Math.round(PREVIEW_W * 0.07),
                top: Math.round(previewH * 0.07),
                width: comp.width,
                height: comp.height,
                border: 0,
                transform: `scale(${previewScale * 0.86})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
          <div className="text-ink-3 truncate px-2 py-1 text-[10px]">{hover.block.label || blockKind(hover.block)}</div>
        </div>
      )}
    </div>
  );
}
