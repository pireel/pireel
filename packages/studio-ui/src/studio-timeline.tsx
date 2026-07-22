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
import { ArrowLeftRight, Film, Loader2, Plus } from 'lucide-react';
import {
  type Block,
  type BlockKind,
  type Composition,
  SHOT_TREATMENTS,
  blockKind,
  blockPreviewDoc,
  cutTransitions,
  editedVideoDuration,
  MAX_TRANSITION_SEC,
  totalDuration,
  isSentenceCaption,
} from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { injectPreviewRuntime } from './sample-composition';
import { KIND_META } from './kind-meta';
import { t } from './i18n';
import { playhead, usePlayheadT } from './playhead';
import type { FilmstripFrame } from './media';

const PREVIEW_W = 108; // hover element preview width

const ROW_H = 30; // overlay track (element/caption) row height: compact to save space (user's call)
const SCENE_H = 78; // track 0 = scene rail, taller to fit scene cards
const SCENE_PAD_T = 12; // gap above scene card (like a mainstream editor): drag from gap = marquee, from card = reorder; bigger on top for easier hit
const SCENE_PAD_B = 8; // gap below scene card
const ROW_GAP = 6;
const RULER_H = 24;
const GUTTER = 40;
const CAP_LANE = -1; // "caption lane" sentinel track number: read-only, no drag/reorder, not in z-reorder, not in marquee; real track numbers are always >=0
const EDGE_PAD = 12; // breathing room between gutter and content: keeps first block's selection ring (ring-2 outset) and first cut-point "+" half-circle (10px) from being clipped by the sticky gutter
const SHOT_GAP = 2; // hairline gap between shot cards (taken off the right edge, left edge stays time-accurate)
export const MIN_PPS = 2; // min zoom: ~2px/s, shows minute scale (1 min ~= 120px, ticks go by minutes)
export const MAX_PPS = 260;
export const DEFAULT_PPS = 78;
const MIN_DUR = 0.3;
const SNAP_PX = 7;

/** Source-time-anchored filmstrip window (like a mainstream editor): tile k always covers source time
 *  [k,k+1)*tileDur; take tiles that intersect the window [srcStart,srcEnd). First tile's left
 *  can be negative (clipped by the card's overflow-hidden) — a split at 2.5 tiles gives 2.5
 *  tiles before and the rest continuing from the middle of tile 2.5, so trailing tiles never resample. */
function stripTiles(strip: FilmstripFrame[], srcStart: number, srcEnd: number, tileDur: number, pps: number): { left: number; url: string }[] {
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

/** Timeline chip category background colors (base label/icon/dot live in shared kind-meta.ts). */
const KIND_CHIP: Record<BlockKind, { chip: string; chipSel: string }> = {
  caption: { chip: 'bg-rose-500/15 ring-rose-400/30 hover:bg-rose-500/25', chipSel: 'bg-rose-500/30 ring-2 ring-rose-400' },
  title: { chip: 'bg-amber-500/15 ring-amber-400/30 hover:bg-amber-500/25', chipSel: 'bg-amber-500/30 ring-2 ring-amber-400' },
  stat: { chip: 'bg-emerald-500/15 ring-emerald-400/30 hover:bg-emerald-500/25', chipSel: 'bg-emerald-500/30 ring-2 ring-emerald-400' },
  list: { chip: 'bg-sky-500/15 ring-sky-400/30 hover:bg-sky-500/25', chipSel: 'bg-sky-500/30 ring-2 ring-sky-400' },
  transition: { chip: 'bg-violet-500/15 ring-violet-400/30 hover:bg-violet-500/25', chipSel: 'bg-violet-500/30 ring-2 ring-violet-400' },
  media: { chip: 'bg-teal-500/15 ring-teal-400/30 hover:bg-teal-500/25', chipSel: 'bg-teal-500/30 ring-2 ring-teal-400' },
  custom: { chip: 'bg-slate-400/15 ring-slate-300/30 hover:bg-slate-400/25', chipSel: 'bg-slate-400/30 ring-2 ring-slate-400' },
};
const TREATMENT_NAME: Record<string, string> = Object.fromEntries(SHOT_TREATMENTS.map((t) => [t.id, t.name]));

/** Playhead cursor: subscribes to the playhead store — at 60fps during playback only this small
 *  component re-renders, not the whole timeline.
 *  Horizontal move must use transform: changing left triggers layout + layout-shift every frame,
 *  fights the engine's rAF for the main thread, and causes visible stutter inside transition
 *  windows (confirmed via the user's Performance panel). */
function PlayheadCursor({ pps }: { pps: number }) {
  const t = usePlayheadT();
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-30 will-change-transform" style={{ transform: `translateX(${t * pps}px)` }}>
      <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-rose" />
      {/* Head marker: down-pointing arrow (border triangle, 8px base aligned with the line) */}
      <div className="absolute top-0 -left-[4px] h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-rose drop-shadow" />
    </div>
  );
}

/** Highlight ring for the scene under the playhead (selected state has its own indigo ring, drawn by the scene card). */
function ActiveSceneRing({
  sceneSpans,
  pps,
  selectedShotIds,
}: {
  sceneSpans: { shot: { id: string }; start: number; end: number }[];
  pps: number;
  selectedShotIds: Set<string>;
}) {
  const t = usePlayheadT();
  const active = sceneSpans.find((sp) => t >= sp.start - 1e-3 && t < sp.end - 1e-3);
  // Selected shots (including all marquee members) already have an accent selection ring; the playhead's white ring yields so they don't stack
  if (!active || selectedShotIds.has(active.shot.id)) return null;
  const lastEnd = sceneSpans.length ? sceneSpans[sceneSpans.length - 1]!.end : 0;
  const gapR = active.end < lastEnd - 1e-3 ? SHOT_GAP : 0; // same rule as scene cards: hairline gap off the right edge
  return (
    <div
      className="pointer-events-none absolute top-3 bottom-2 left-0 z-10 rounded ring-2 ring-white/70 will-change-transform"
      // Horizontal move via transform: if the ring's jump at cut points went through left it would log layout-shift + full-track reflow, landing exactly on the transition's peak frame
      style={{ transform: `translateX(${active.start * pps}px)`, width: Math.max(8, (active.end - active.start) * pps - gapR) }}
    />
  );
}

/** Adaptive ruler step: keep each cell >= ~64px. */
function rulerStep(pps: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pps >= 64) return s;
  return 1200;
}

/** Tick label: mm:ss for >=60s, otherwise Xs. */
function fmtTick(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
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
  /** Marquee: drag a rectangle from the **top/bottom gap** of the scene track (like a mainstream editor; dragging from the card = reorder); matched shot ids all become the multi-select set. */
  onBoxSelectShots: (ids: string[]) => void;
  /** Scene card drag-reorder (drag from the card, like a mainstream editor): move clip `from` to position `to` in the clip sequence (splice semantics). */
  onReorderShot?: (from: number, to: number) => void;
  /** Move a block across tracks (drag chip vertically into another element track row): changing trackIndex = changing z (NLE convention).
   *  Empty tracks vanish on their own — track rows derive from blocks, so emptying one collapses it; no explicit cleanup. */
  onMoveBlockTrack?: (id: string, trackIndex: number) => void;
  /** Drag a block into a row gap = spawn a new track (like a mainstream editor): slot = insert position in the overlay tracks' top-to-bottom display order (0..N).
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
  assetDragKind?: 'image' | 'video' | 'element' | null;
  /** Asset (image) dropped on a non-main-track area: report the drop time (sec); workbench inserts an asset block there. */
  onDropAsset?: (t: number) => void;
  /** Asset dropped on the main track: handled as a clip insert (video = whole clip, image = 5s static frame); workbench fetches bytes via insertClipCore. */
  onDropAssetClip?: (t: number) => void;
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
  // Filmstrip tiles (like a mainstream editor): square tiles (width=height, object-cover crop), grid anchored on **source time** —
  // each card just "windows" (stripTiles) the continuous strip; after split/trim each segment continues the original strip, never re-laying-out trailing segments
  const thumbW = SCENE_H - SCENE_PAD_T - SCENE_PAD_B;
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
   *  Pressing on a card is intercepted by the card itself for reorder (startShotDrag); the two gestures split by start point, like a mainstream editor. */
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
  const dropAllowed = (clip: boolean) => (clip ? assetDragKind !== 'element' : assetDragKind !== 'video');
  // On drag end (released outside the timeline / cancelled) clear the marker
  useEffect(() => {
    if (!assetDragging) setDropHint(null);
  }, [assetDragging]);

  // Generic pointer drag (returns whether it actually dragged -> distinguishes click vs drag). pointermove is coalesced to once per frame via rAF,
  // to avoid seeking the video on every event (decoding is expensive) which causes jank; draggingRef makes hover-seek yield during the drag.
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
    let raf = 0;
    draggingRef.current = true;
    const flush = () => {
      raf = 0;
      if (moved) onMove(lastX, lastY);
    };
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; } // missed pointerup: finish immediately, don't track bare movement
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true; // pure vertical (cross-track) also counts as a drag
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (moved && !raf) raf = requestAnimationFrame(flush);
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

  // Scene card drag-reorder (like a mainstream editor): drag from the **card** = reorder, drag from the track's top/bottom gap = marquee (onLanePointerDown).
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
                if (clip) onDropAssetClip?.(secAt(e.clientX));
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
                      ? { label: sceneRail ? t('场景') : t('视频'), icon: Film, dot: 'text-accent' }
                      : KIND_META[k];
                const Icon = meta.icon;
                const dragging = trackDrag?.track === track;
                return (
                  <div
                    key={track}
                    onPointerDown={track > 0 ? (e) => startTrackDrag(e, track) : undefined}
                    title={track > 0 ? t('拖动调整轨道层级(上面的盖住下面的)') : undefined}
                    className={`flex items-center gap-1.5 px-2.5 text-[11px] ${track > 0 ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'bg-panel-2 relative z-10 rounded' : ''}`}
                    style={{ height: rowH(track), marginTop: track === 0 ? 0 : ROW_GAP, transform: dragging ? `translateY(${trackDrag!.dy}px)` : undefined }}
                  >
                    <Icon size={13} className={meta.dot} />
                  </div>
                );
              })}
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
                else if (performance.now() - a.ts >= 160 && Math.hypot(e.clientX - a.x, e.clientY - a.y) >= 6) scrubArmedRef.current = true;
              }
              if (!hoverRaf.current)
                hoverRaf.current = requestAnimationFrame(() => {
                  hoverRaf.current = 0;
                  const tt = secAt(hoverXRef.current);
                  setHoverT(tt); // hover line, instant feedback
                  if (scrubArmedRef.current) onScrub(tt); // only follow after armed: at most once per frame, center preview jumps frames
                });
            }}
            onMouseLeave={() => {
              if (hoverRaf.current) {
                cancelAnimationFrame(hoverRaf.current);
                hoverRaf.current = 0;
              }
              const armed = scrubArmedRef.current;
              scrubEnterRef.current = null;
              scrubArmedRef.current = false;
              setHoverT(null);
              if (armed) onScrub(null); // restore to the playhead (if never armed, the preview never moved, so no restore needed)
            }}
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
            <div ref={tracksRef} className="relative" style={{ height: tracksH }}>
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
                          // Pressing on the card = enter the reorder channel (stopPropagation blocks the track's marquee; only the top/bottom gap is the marquee entry, like a mainstream editor)
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
                          title={t('场景 {n} · 镜头:{name}', { n: i + 1, name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
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
                                  <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                                ));
                              })()}
                            </div>
                          ) : (
                            <>
                              {stripTiles(filmstrip ?? [], shot.srcStart, shot.srcEnd, tileDur, pps).map((tl, ti) => (
                                <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none pointer-events-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                              ))}
                              {(filmstrip ?? []).length === 0 && <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />}
                            </>
                          )}
                          {/* Index number */}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-semibold leading-[14px] text-white">{i + 1}</span>
                        </button>

                        {/* Treatment badge (per shot): click selects the shot -> opens the right-side treatment panel (style cards). Sits at the scene card's bottom-left.
                            Treatment always applies to the whole shot (one shot = one treatment; split to localize), and applies as set — no "merge if dwell is too short"
                            (that restraint is for LLM shot-planning, not for user manual cuts). */}
                        <div className="absolute z-30" style={{ left: x(start) + 3, bottom: SCENE_PAD_B + 1 }}>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenShotSettings(shot.id);
                            }}
                            title={t('取景:{name}', { name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                            className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium leading-[14px] shadow ${
                              hasTreatment ? 'bg-accent/90 text-white' : 'bg-black/55 text-white/80 hover:text-white'
                            }`}
                          >
                            {hasTreatment ? t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) : t('取景')}
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
                              title={t('添加转场')}
                              aria-label={t('添加转场')}
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
                            title={t('拖动调时长(左右对称)')}
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
                              title={t('转场 · {sec}s(点击修改)', { sec: (half * 2).toFixed(1) })}
                              aria-label={t('修改转场')}
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
                        title={t('在此插入本地视频')}
                        aria-label={t('在此插入本地视频')}
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

              {/* Caption lane: sentence-caption read-only chips (follow the transcript, no drag/trim; click = playhead jumps to click point, edited from the caption panel) */}
              {hasCaptions &&
                captionBlocks.map((b) => (
                  <div
                    key={b.id}
                    title={b.label || t('字幕')}
                    className="absolute overflow-hidden rounded-md bg-rose-500/12 ring-1 ring-rose-400/25 transition hover:bg-rose-500/20"
                    style={{ left: x(b.startSec), width: Math.max(10, x(b.durationSec)), top: rowTop(CAP_LANE) + 4, height: ROW_H - 8 }}
                    onClick={(e) => {
                      e.stopPropagation(); // read-only: click = jump playhead to click point, no select/deselect
                      onSeek(secAt(e.clientX));
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center px-2">
                      <span className="text-ink-2 truncate text-[10px]">{b.label || t('字幕')}</span>
                    </div>
                  </div>
                ))}

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
                    {dropHint.clip ? t('插入片段({mode})· {sec}s', { mode: assetDragKind === 'image' ? t('5s 静帧') : t('整段'), sec: dropHint.t.toFixed(1) }) : t('插入到 {sec}s', { sec: dropHint.t.toFixed(1) })}
                  </div>
                </div>
              )}

              {/* External clip insert in progress (download/upload/reading duration): show a badge at the drop point so it doesn't look like the drag did nothing */}
              {clipPendingAt != null && (
                <div className="pointer-events-none absolute z-40 -translate-x-1/2" style={{ left: x(clipPendingAt), top: 8 }}>
                  <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white">
                    <Loader2 size={10} className="animate-spin" /> {t('插入中…')}
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
