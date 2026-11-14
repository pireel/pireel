'use client';

/**
 * The timeline drawn on canvas.
 *
 * The DOM timeline (studio-timeline.tsx) keeps an element per clip: a 44-minute talk is 1,574
 * clips and 9,000 elements, of which 300 are on screen, and every click re-rendered and laid out
 * all of them. Here a frame paints what the window shows and a margin either side, and the pointer
 * finds what it is over by looking it up in the layout, so the cost of a gesture follows the screen.
 *
 * Two canvases, both wider than the visible lanes and both scrolled by the browser like any content:
 * the clips, repainted only when they change or the window nears the painted edge (scrolling within
 * it runs no script, so it stays smooth while the page is busy), and over them a layer for what
 * follows the pointer or the clock (playhead, hover and snap lines, ghosts), which is a few strokes.
 *
 * Chosen by `timelineRenderer()` while it is checked against the DOM timeline. In place: the picture of every lane, scrolling,
 * zoom, seeking on the ruler, dragging the playhead, hover preview, frame picking, selecting,
 * following the playhead, moving and trimming video, media, graphics, captions and audio, audio
 * fades and mute, slipping a shot, carrying a clip to another lane, moving and resizing
 * transitions, reordering lanes, marquee selection, dropping assets from a panel, and the slip panel.
 */

import { useClipStrips } from '@pireel/studio-ui/clip-strips-store';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Film, GalleryHorizontal, Music, Volume2, VolumeX } from 'lucide-react';
import { AUDIO_FADE_MAX_SEC, type BlockKind, MAX_TRANSITION_SEC, audioClipDefaults, audioClipWindow, audioTrimPatch, totalDuration } from '@pireel/studio-engine/composition';
import { type FilmstripSourceRange, filmstripSourceRangeForTimelineWindow } from '@pireel/studio-ui/media';
import { blockDisplayTitle } from './block-display-title';
import { DIRECTOR_SCENE_STRIP_H, DirectorSceneStrip } from './director-scene-strip';
import { t } from './i18n';
import { KIND_META } from './kind-meta';
import { playhead } from './playhead';
import type { StudioTimelineProps } from './studio-timeline';
import type { TimelineInsertMode, TimelineMediaDropTarget } from './timeline-asset-drop';
import { audioChip, audioZoneAt } from './timeline-canvas/audio-chip';
import { type TimelineItem, type TimelineLane, audioTrackIdOf, itemBox, itemsBetween, liveKey, timelineLayout, visualTrackIdOf } from './timeline-canvas/layout';
import { type TimelinePaintState, emptyLiveEdit, originX, paintOverlay, paintTimeline, tracksY } from './timeline-canvas/paint';
import { type AudioMoveTarget, type BlockMoveTarget, audioMoveTarget, blockMoveTarget, dropRows, edgeAt, insertionLineTop, slipButtonBox, visualMoveTarget } from './timeline-canvas/targets';
import { type SlipPanelLive, TimelineSlipPanel } from './timeline-slip-panel';
import { transitionIcon } from './transition-icons';
import { type TimelineColors, readTimelineColors } from './timeline-canvas/theme';
import { draggedPlayheadSecond, snapTimelineSecond, timelineSnapPoints } from './timeline-snap';
import { MuteToggle, VisibilityToggle } from './timeline-track-toggles';
import { CAP_LANE, EDGE_PAD, GUTTER, MAX_PPS, MIN_DUR, MIN_PPS, TIMELINE_METRICS, packedPrimaryPlacement, quantizeTimelineFrameSecond, timelinePointerSecond, timelineResizeSurfaceDuration, timelineSourceResizeEnd } from './timeline-utils';

const BLOCK_KINDS = Object.keys(KIND_META) as BlockKind[];
/** Topmost first: what a press lands on where items overlap. */
const HIT_ORDER = ['transition', 'audio', 'caption', 'block', 'visual', 'shot'] as const;
const PLAYHEAD_GRAB_PX = 8;
const EDGE_SCROLL_PX = 44;
const IMAGE_CACHE_MAX = 900;
/** How much of the lanes is painted beyond each side of the window, as a share of its width. */
const OVERSCAN = 0.75;
/** The widest a canvas is made, in device px (well inside every browser's limit). */
const MAX_CANVAS_PX = 8192;
/** The strip under the last lane where a dragged clip makes a new one, while a project has no audio lane to end on. */
const NEW_LANE_ZONE_H = 38;
type ItemOf<K extends TimelineItem['kind']> = Extract<TimelineItem, { kind: K }>;
type Edge = 'left' | 'right';
type SnapLock = { edge: 'start' | 'end'; point: number } | null;
/** Small glyphs the canvas draws, as the page would: the icon, and the theme colour it takes. */
const GLYPHS = [
  ['audio', Music, 'accentInk'], ['audio-muted', VolumeX, 'ink4'], ['sound-on', Volume2, 'ink3'], ['sound-off', VolumeX, 'ink3'], ['drop-audio', Music, 'accentInk'],
  ['spine-empty', Film, 'ink4'], ['spine-drop', Film, 'accentInk'], ['slip', GalleryHorizontal, 'white'],
] as const;

export function StudioTimelineCanvas(props: StudioTimelineProps) {
  // What only a frame reads (selection, thumbnails, peaks) is taken from `props` when it is painted.
  const {
    comp, density = 'comfortable', videoPlacements, timelineDurationSec, playing, locateSignal, locateNear, pps, onPps, snapEnabled = true,
    framePickActive = false, framePickFps = 30, onPickFrame, onSeek, onScrub, onSelectShot, onSelectBlock, onDeselectAll,
    onSelectVisualClip, videoMuted, onToggleVideoMute, videoHidden, onToggleVideoHidden,
    audioMuted, onToggleAudioMute, trackStates, onToggleTrackMute, onToggleTrackHidden,
    onSelectAudio, onOpenMusicPanel, onFilmstripDemandChange,
    transitions, onSelectTransition, onChangeTransition, pendingRanges, assetDragKind, shotSourceDurations,
    onMoveShot, onResizeShot, onSlipShot, onSlipPreview, onMoveBlock, onResizeBlock, onResizeCaption, onMoveBlockTrack, onMoveBlockNewTrack,
    onMoveVisualClip, onResizeVisualClip, onBoxSelectShots, onBoxSelectBlocks, disabledClipIds,
    onMoveAudio, onTrimAudio, onFadeAudio, onToggleAudioClipMute, onReorderTracks,
    assetDragging, onDropAsset, onDropAssetClip, onDropAssetAudio, directorScenes,
  } = props;
  const dropActive = !!assetDragging && !!assetDragKind;
  // The director strip (an admin view) lies between the ruler and the lanes, over the canvas.
  const topInset = directorScenes?.length ? DIRECTOR_SCENE_STRIP_H : 0;
  const M = TIMELINE_METRICS[density];
  const dur = timelineDurationSec ?? totalDuration(comp);
  const layout = useMemo(() => timelineLayout({
    comp, metrics: M, durationSec: dur, videoPlacements, trackStates, transitions,
    transitionsEditable: !!onChangeTransition, pendingRanges, audioDropLane: assetDragKind === 'audio',
  }), [comp, M, dur, videoPlacements, trackStates, transitions, onChangeTransition, pendingRanges, assetDragKind]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** The clips' canvas, and over it the one the pointer meets. */
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconsRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<TimelineColors | null>(null);
  // A right edge dragged past the end takes the lanes with it; a lifted clip opens room under the last lane.
  const [endResizeSec, setEndResizeSec] = useState<number | null>(null);
  const [lifting, setLifting] = useState(false);
  const surfaceWidth = Math.max(320, timelineResizeSurfaceDuration(dur, pps, endResizeSec ?? undefined) * pps, dur > 0 ? 0 : view.width - EDGE_PAD * 2);
  const tracksHeight = layout.tracksHeight + ((lifting || dropActive) && !layout.lanes.some((lane) => lane.audio) ? NEW_LANE_ZONE_H : 0);

  // What a frame is painted from. Kept in a ref: the pointer, the playhead and scrolling change it
  // many times a second, and none of that is a reason to render React again.
  const live = useRef({ hoverSec: null as number | null, hoverId: null as string | null, guideSec: null as number | null, dragging: false, edit: emptyLiveEdit() });
  const frameRef = useRef(0);
  const paintRef = useRef<() => void>(() => {});
  /** What the clips' canvas holds: where its left edge sits in the lanes, how wide it is, and the
   *  vertical scroll it was painted at. `stale` asks for it to be painted again. */
  const painted = useRef({ anchor: 0, width: 0, scrollTop: 0, stale: true });
  /** A frame for the layer over the clips only (the playhead moved, the pointer moved). */
  const requestOverlay = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; paintRef.current(); });
  }, []);
  /** A frame that paints the clips again as well. */
  const requestPaint = useCallback(() => {
    painted.current.stale = true;
    requestOverlay();
  }, [requestOverlay]);
  // Cleared as well as cancelled: an effect that runs again must be able to ask for a frame.
  useEffect(() => () => { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }, []);

  // Pictures (filmstrip tiles, stills) by address; one arriving asks for another frame.
  const images = useRef(new Map<string, HTMLImageElement>());
  const image = useCallback((url: string): CanvasImageSource | null => {
    const cache = images.current;
    let entry = cache.get(url);
    if (!entry) {
      if (cache.size >= IMAGE_CACHE_MAX) for (const key of [...cache.keys()].slice(0, IMAGE_CACHE_MAX / 3)) cache.delete(key);
      entry = new Image();
      entry.decoding = 'async';
      entry.onload = requestPaint;
      entry.src = url;
      cache.set(url, entry);
    } else { // most recently used last
      cache.delete(url);
      cache.set(url, entry);
    }
    return entry.complete && entry.naturalWidth > 0 ? entry : null;
  }, [requestPaint]);

  // Colours follow the theme: read once, and again when the page's theme class changes.
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const read = () => setColors(readTimelineColors(host));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  // The kind icons are the same components the lane headers use, drawn once per colour into images.
  const [kindIcons, setKindIcons] = useState<Map<BlockKind, HTMLImageElement>>(new Map());
  useEffect(() => {
    const host = iconsRef.current;
    if (!host || !colors) return;
    const next = new Map<BlockKind, HTMLImageElement>();
    for (const kind of BLOCK_KINDS) {
      const svg = host.querySelector(`[data-kind="${kind}"] svg`);
      if (!svg) continue;
      const picture = new Image();
      picture.onload = requestPaint;
      picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML.replaceAll('currentColor', colors.kinds[kind].icon))}`;
      next.set(kind, picture);
    }
    setKindIcons(next);
  }, [colors, requestPaint]);
  const transitionEffects = useMemo(() => [...new Set((transitions ?? []).map((item) => item.effect ?? ''))].sort().join('|'), [transitions]);
  const [glyphs, setGlyphs] = useState<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    const host = iconsRef.current;
    if (!host || !colors) return;
    const next = new Map<string, HTMLImageElement>();
    for (const holder of host.querySelectorAll<HTMLElement>('[data-glyph]')) {
      const svg = holder.querySelector('svg');
      if (!svg) continue;
      const picture = new Image();
      picture.onload = requestPaint;
      picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML.replaceAll('currentColor', colors[holder.dataset.tone as 'ink3']))}`;
      next.set(holder.dataset.glyph!, picture);
    }
    setGlyphs(next);
  }, [colors, requestPaint, transitionEffects]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const measure = () => setView((current) => {
      const width = Math.max(0, host.clientWidth - GUTTER);
      const height = host.clientHeight;
      return current.width === width && current.height === height ? current : { width, height };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const [slipPanel, setSlipPanel] = useState<string | null>(null);
  const paintInput = { layout, M, colors, view, pps, dur, surfaceWidth, kindIcons, glyphs, topInset, slipPanel, props };
  const input = useRef(paintInput);
  input.current = paintInput;
  paintRef.current = () => {
    const base = baseRef.current;
    const overlay = canvasRef.current;
    const host = scrollRef.current;
    const now = input.current;
    if (!base || !overlay || !host || !now.colors || !now.view.width || !now.view.height) return;
    const dpr = window.devicePixelRatio || 1;
    const viewWidth = now.view.width;
    const scrollLeft = host.scrollLeft;
    const scrollTop = host.scrollTop;
    // The canvases cover the window and a margin either side, never more than the lanes themselves
    // (a canvas past their end would lengthen the scrollbar).
    const lanesWidth = EDGE_PAD * 2 + now.surfaceWidth;
    const margin = Math.max(0, Math.min(Math.round(viewWidth * OVERSCAN), Math.floor((MAX_CANVAS_PX / dpr - viewWidth) / 2)));
    const wanted = Math.max(viewWidth, Math.min(viewWidth + margin * 2, lanesWidth));
    const was = painted.current;
    // Painted again when something changed, when the window has come within a third of the margin
    // of what is painted (or the lanes scrolled vertically, which has no margin), or it was resized.
    const reach = margin / 3;
    const covered = scrollLeft >= was.anchor + (was.anchor > 0 ? reach : 0)
      && scrollLeft + viewWidth <= was.anchor + was.width - (was.anchor + was.width < lanesWidth ? reach : 0);
    const repaint = was.stale || !covered || was.width !== wanted || was.scrollTop !== scrollTop
      || base.height !== Math.round(now.view.height * dpr);
    const anchor = repaint ? Math.max(0, Math.min(scrollLeft - margin, lanesWidth - wanted)) : was.anchor;
    const width = repaint ? wanted : was.width;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(now.view.height * dpr);
    for (const canvas of [base, overlay]) {
      if (!repaint) break;
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      canvas.style.left = `${GUTTER + anchor}px`;
      canvas.style.width = `${width}px`;
    }
    const context = repaint ? base.getContext('2d') : null;
    const overlayContext = overlay.getContext('2d');
    if (!overlayContext || (repaint && !context)) return;
    const p = now.props;
    const state: TimelinePaintState = {
      width, height: now.view.height, dpr, scrollLeft: anchor, scrollTop,
      pps: now.pps, durationSec: now.dur, surfaceWidth: now.surfaceWidth, layout: now.layout, metrics: now.M, colors: now.colors,
      playheadSec: playhead.get(), hoverSec: live.current.hoverSec, framePick: !!p.framePickActive, guideSec: live.current.guideSec, hoverId: live.current.hoverId,
      edit: live.current.edit, captionsTrim: !!p.onResizeCaption, topInset: now.topInset,
      videoDragging: !!p.assetDragging && p.assetDragKind === 'video', insertingAtSec: p.clipPendingAt ?? null,
      slip: { can: (shotId) => !!p.onSlipShot && (p.shotSourceDurations?.get(shotId) ?? 0) > 0, open: now.slipPanel },
      selectedShots: p.selectedShotIds, selectedBlocks: p.selectedBlockIds, selectedVisualId: p.selectedVisualClipId ?? null,
      selectedAudioId: p.selectedAudioId ?? null, selectedTransitionId: p.selectedTransitionId ?? null, disabledIds: p.disabledClipIds,
      filmstrip: p.filmstrip ?? [], clipStrips: p.clipStripsStore?.get() ?? p.clipStrips ?? {}, sourcePeaks: p.sourcePeaks, audioPeaks: p.audioPeaks,
      mainLive: p.mainLive ?? true, sourceLive: p.srcLive, image, kindIcon: (kind) => { const icon = now.kindIcons.get(kind); return icon?.complete ? icon : null; },
      icon: (name) => { const glyph = now.glyphs.get(name); return glyph?.complete ? glyph : null; }, audioMute: !!p.onToggleAudioClipMute,
      labels: { video: t('panels.video'), image: t('panels.image'), captions: t('panels.captions'), music: t('panels.musicBed'), missing: t('workbench.srcMissing'), dropAudio: t('panels.dropAudioHere'), emptySpine: t('panels.emptyPrimaryTrackDropVideo'), dropOnSpine: t('panels.releaseVideoOnPrimaryTrack'), inserting: t('common.inserting'), blockTitle: (item) => blockDisplayTitle(item.block) },
    };
    if (context) {
      paintTimeline(context, state);
      painted.current = { anchor, width, scrollTop, stale: false };
    }
    paintOverlay(overlayContext, state);
  };
  // Anything React knows that changed is painted on the next frame; a playhead move only repaints the layer it is on.
  useEffect(requestPaint);
  useEffect(() => playhead.subscribe(requestOverlay), [requestOverlay]);

  // ---- where the pointer is ---------------------------------------------------------------------
  const pointAt = (clientX: number, clientY: number) => {
    const box = canvasRef.current!.getBoundingClientRect();
    const host = scrollRef.current!;
    const x = clientX - box.left;
    const y = clientY - box.top;
    const contentX = x - originX({ scrollLeft: painted.current.anchor });
    return { x, y, contentX, rawSec: contentX / pps, sec: timelinePointerSecond(contentX / pps, dur), tracksYAt: y - tracksY({ scrollTop: host.scrollTop, metrics: M, topInset }), inRuler: y < M.rulerH };
  };
  const itemAt = (contentX: number, y: number): TimelineItem | null => {
    const second = contentX / pps;
    for (const kind of HIT_ORDER) {
      const near = itemsBetween<TimelineItem>(layout.byKind[kind], second, second, 32 / pps);
      for (let index = near.length - 1; index >= 0; index -= 1) {
        const item = near[index]!;
        const box = itemBox(item, pps);
        if (contentX >= box.left && contentX <= box.left + box.width && y >= item.top && y <= item.top + item.height) return item;
      }
    }
    return null;
  };
  const laneAt = (y: number): TimelineLane | null => layout.lanes.find((lane) => y >= lane.top && y <= lane.top + lane.height) ?? null;

  // ---- snapping ---------------------------------------------------------------------------------
  const snapPoints = useMemo(() => timelineSnapPoints(
    dur,
    [...layout.byKind.shot, ...layout.byKind.visual].map((item) => ({ start: item.startSec, end: item.endSec })),
    comp.blocks,
    comp.audioTracks ?? [],
  ), [dur, layout, comp.blocks, comp.audioTracks]);
  const snapPlayhead = (second: number, lockedPoint: number | null) => {
    if (!snapEnabled) { live.current.guideSec = null; return { second: Math.round(second * 100) / 100, hit: null as number | null }; }
    const result = snapTimelineSecond(second, snapPoints, { pps, lockedPoint });
    live.current.guideSec = result.hit;
    return result;
  };

  /** A clip edge or start: to the nearest clip edge, second or the playhead, its own edges left out. */
  const snap = (second: number, exclude?: readonly number[]) => {
    if (!snapEnabled) { live.current.guideSec = null; return Math.round(second * 100) / 100; }
    const result = snapTimelineSecond(second, snapPoints, { pps, dynamicPoints: [playhead.get()], exclude });
    live.current.guideSec = result.hit;
    return result.second;
  };
  /** A moved clip snaps by whichever of its two ends is nearer a point, and stays on the end it took. */
  const snapClipStart = (rawStart: number, durationSec: number, exclude: readonly number[], locked: SnapLock): { startSec: number; lock: SnapLock } => {
    if (!snapEnabled) { live.current.guideSec = null; return { startSec: Math.round(rawStart * 100) / 100, lock: null }; }
    const candidate = (edge: 'start' | 'end') => {
      const offset = edge === 'start' ? 0 : durationSec;
      const result = snapTimelineSecond(rawStart + offset, snapPoints, { pps, dynamicPoints: [playhead.get()], exclude, lockedPoint: locked?.edge === edge ? locked.point : null });
      return { edge, offset, result, distance: Math.abs(result.second - (rawStart + offset)) };
    };
    const start = candidate('start');
    const end = candidate('end');
    const best = start.result.hit != null && (end.result.hit == null || start.distance <= end.distance) ? start : end;
    if (best.result.hit == null) { live.current.guideSec = null; return { startSec: Math.round(rawStart * 100) / 100, lock: null }; }
    live.current.guideSec = best.result.hit;
    return { startSec: Math.max(0, Math.round((best.result.second - best.offset) * 100) / 100), lock: { edge: best.edge, point: best.result.hit } };
  };

  /** A pointer drag: `onMove` runs at most once a frame, and near either edge of the window the
   *  timeline keeps scrolling under a still pointer, replaying the move as it goes. */
  const drag = (event: React.PointerEvent, onMove: (clientX: number, clientY: number) => void, onEnd?: (moved: boolean) => void) => {
    event.preventDefault();
    endScrub();
    const startX = event.clientX;
    const startY = event.clientY;
    let lastX = startX;
    let lastY = startY;
    let moved = false;
    let dirty = false;
    let frame = 0;
    live.current.dragging = true;
    const tick = () => {
      const host = scrollRef.current;
      let scrolled = false;
      if (host && moved) {
        const box = host.getBoundingClientRect();
        const leftEdge = box.left + GUTTER + EDGE_SCROLL_PX;
        const push = lastX < leftEdge ? -Math.ceil(((leftEdge - lastX) / EDGE_SCROLL_PX) * 44) : lastX > box.right - EDGE_SCROLL_PX ? Math.ceil(((lastX - (box.right - EDGE_SCROLL_PX)) / EDGE_SCROLL_PX) * 44) : 0;
        if (push) { const before = host.scrollLeft; host.scrollLeft += push; scrolled = host.scrollLeft !== before; }
      }
      // A gesture that holds clips repaints them; one that only moves the playhead or a marquee does not.
      if (moved && (dirty || scrolled)) { dirty = false; onMove(lastX, lastY); if (live.current.edit.items.size) requestPaint(); else requestOverlay(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const move = (next: PointerEvent) => {
      if (next.buttons === 0) { end(); return; } // a missed release: finish instead of tracking bare movement
      if (Math.abs(next.clientX - startX) > 3 || Math.abs(next.clientY - startY) > 3) moved = true;
      lastX = next.clientX;
      lastY = next.clientY;
      dirty = true;
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(frame);
      if (moved && dirty) onMove(lastX, lastY); // released between frames: the pointer's true last position
      live.current.guideSec = null;
      live.current.dragging = false;
      requestPaint();
      onEnd?.(moved);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // ---- hover preview ----------------------------------------------------------------------------
  // The centre preview follows the pointer only after it has stayed 160 ms and moved 6 px: a cursor
  // passing through on its way elsewhere must not make the picture jump.
  const scrub = useRef({ enter: null as { x: number; y: number; at: number } | null, armed: false });
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const endScrub = useCallback(() => {
    const wasArmed = scrub.current.armed;
    scrub.current = { enter: null, armed: false };
    live.current.hoverSec = null;
    live.current.hoverId = null;
    if (canvasRef.current) canvasRef.current.style.cursor = '';
    requestPaint();
    if (wasArmed) onScrubRef.current(null); // back to the playhead
  }, [requestPaint]);
  useEffect(() => endScrub, [endScrub]);
  useEffect(() => { endScrub(); }, [framePickActive, endScrub]);
  useEffect(() => {
    window.addEventListener('blur', endScrub);
    return () => window.removeEventListener('blur', endScrub);
  }, [endScrub]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (live.current.dragging || event.buttons !== 0) return;
    const at = pointAt(event.clientX, event.clientY);
    const overPlayhead = Math.abs(at.contentX - playhead.get() * pps) <= PLAYHEAD_GRAB_PX;
    const item = at.inRuler || overPlayhead ? null : itemAt(at.contentX, at.tracksYAt);
    const hoverChanged = live.current.hoverId !== (item?.id ?? null);
    live.current.hoverId = item?.id ?? null;
    const zone = !item || framePickActive ? null
      : item.kind === 'audio' ? audioZone(item, at)
      : item.kind === 'transition' ? (onChangeTransition ? transitionZone(item, at.contentX) : null)
      : trimEdge(item, at.contentX);
    const trims = zone != null && zone !== 'body' && zone !== 'move' && zone !== 'mute' && !(item && onSlipButton(item, at));
    event.currentTarget.style.cursor = framePickActive ? 'crosshair' : at.inRuler || overPlayhead || trims ? 'ew-resize' : zone === 'body' || zone === 'move' ? 'grab' : item ? 'pointer' : '';
    if (framePickActive) {
      const second = quantizeTimelineFrameSecond(at.sec, dur, framePickFps);
      scrub.current.armed = true;
      live.current.hoverSec = second;
      onScrub(second);
    } else {
      const entered = scrub.current.enter;
      if (!scrub.current.armed) {
        if (!entered) scrub.current.enter = { x: event.clientX, y: event.clientY, at: performance.now() };
        else if (performance.now() - entered.at >= 160 && Math.hypot(event.clientX - entered.x, event.clientY - entered.y) >= 6) scrub.current.armed = true;
      }
      live.current.hoverSec = at.sec;
      if (scrub.current.armed) onScrub(at.sec);
    }
    // The hover line is on the layer over the clips; the clips repaint only when the pointer meets another one.
    if (hoverChanged) requestPaint(); else requestOverlay();
  };

  // ---- pressing a clip --------------------------------------------------------------------------
  type Point = ReturnType<typeof pointAt>;
  const edit = live.current.edit;
  const rows = useMemo(() => dropRows(layout), [layout]);
  const shotsInOrder = useMemo(() => [...layout.byKind.shot].sort((a, b) => a.index - b.index), [layout]);
  /** The edge a press would trim, for the kinds this host lets be trimmed. */
  const trimEdge = (item: TimelineItem, contentX: number): Edge | null => {
    const can = item.kind === 'shot' ? !!onResizeShot
      : item.kind === 'visual' ? !!onResizeVisualClip
      : item.kind === 'caption' ? !!onResizeCaption && !disabledClipIds?.has(item.id)
      : item.kind === 'block';
    return can ? edgeAt(item, contentX, pps) : null;
  };
  /**
   * Whether the pointer is still over the lane a dragged clip came from. The strip that makes a new
   * lane reaches 10 px into the lanes either side of a boundary, which on a 22 px lane leaves 2 px
   * that mean "this lane": a clip dragged sideways would land on a new lane by accident. So a clip
   * keeps its lane until the pointer leaves it.
   */
  const overHome = (item: TimelineItem, y: number) => {
    const home = layout.laneByKey.get(item.lane);
    return !!home && y >= home.top && y <= home.top + home.height;
  };
  /** A gesture is over: the picture goes back to the document's. */
  const settle = () => {
    edit.items.clear();
    edit.ghost = null;
    edit.line = null;
    edit.marquee = null;
    setEndResizeSec(null);
    setLifting(false);
  };
  /** A press let go where it landed. */
  const click = (item: TimelineItem, at: Point, additive: boolean) => {
    switch (item.kind) {
      case 'shot':
        if (!additive) onSeek(at.sec);
        onSelectShot(item.id, additive);
        break;
      case 'visual': onSelectVisualClip?.(item.id); onSeek(at.sec); break;
      case 'block':
      case 'caption':
        if (!additive) onSeek(at.sec);
        onSelectBlock(item.id, additive);
        break;
      case 'audio': onSelectAudio?.(item.id); onOpenMusicPanel?.(); break;
      case 'transition': onSelectTransition?.(item.id); break;
      default: break;
    }
  };
  /** A video or image lifted off its lane: it stays faint in place while its ghost follows the pointer. */
  const lift = (
    event: React.PointerEvent, item: ItemOf<'shot' | 'visual'>, at: Point, allowPrimary: boolean,
    onDrop: (startSec: number, target: TimelineMediaDropTarget) => void, onClick: () => void,
  ) => {
    const key = liveKey(item);
    const durationSec = item.endSec - item.startSec;
    const grab = at.sec - item.startSec;
    const grabY = at.tracksYAt - item.top;
    const primarySpans = shotsInOrder.map((shot) => ({ id: shot.id, startSec: shot.startSec, endSec: shot.endSec }));
    let lock: SnapLock = null;
    let held: { startSec: number; target: TimelineMediaDropTarget } | null = null;
    drag(event, (clientX, clientY) => {
      const point = pointAt(clientX, clientY);
      const snapped = snapClipStart(Math.max(0, point.sec - grab), durationSec, [item.startSec, item.endSec], lock);
      lock = snapped.lock;
      let target: TimelineMediaDropTarget = overHome(item, point.tracksYAt)
        ? (item.kind === 'shot' ? { kind: 'primary' } : { kind: 'visual', trackId: item.trackId })
        : visualMoveTarget(layout, rows, point.tracksYAt, allowPrimary, M.visualSceneH);
      if (target.kind === 'primary' && snapEnabled) {
        // The story spine stays packed: the pointer picks a place in the order, and the line shows where that starts.
        const packed = packedPrimaryPlacement(primarySpans, item.id, snapped.startSec, durationSec);
        target = { kind: 'primary', insertIndex: packed.index };
        live.current.guideSec = packed.startSec;
      }
      held = { startSec: snapped.startSec, target };
      edit.items.set(key, { startSec: item.startSec, endSec: item.endSec, faint: true });
      edit.ghost = { item, startSec: snapped.startSec, top: point.tracksYAt - grabY };
      edit.line = target.kind === 'visual-new' ? { top: insertionLineTop(rows, target.slot), tone: 'media' } : null;
      setLifting(true);
    }, (moved) => {
      const dropped = held;
      settle();
      if (moved && dropped) onDrop(dropped.startSec, dropped.target);
      else if (!moved) onClick();
    });
  };

  /** Whether a point is on a shot's slip button. */
  const onSlipButton = (item: TimelineItem, at: Pick<Point, 'contentX' | 'tracksYAt'>): boolean => {
    if (item.kind !== 'shot' || !onSlipShot || !((shotSourceDurations?.get(item.id) ?? 0) > 0)) return false;
    const box = itemBox(item, pps);
    const button = slipButtonBox({ x: box.left, y: item.top, w: box.width });
    return !!button && at.contentX >= button.x && at.contentX <= button.x + button.size && at.tracksYAt >= button.y && at.tracksYAt <= button.y + button.size;
  };
  /** What a drag in the slip panel would do, shown on the shot's card and in the preview. */
  const slipLive = (item: ItemOf<'shot'>, next: SlipPanelLive | null) => {
    const { shot } = item;
    const key = liveKey(item);
    const rate = (shot.srcEnd - shot.srcStart) / Math.max(0.001, item.endSec - item.startSec);
    if (!next) {
      edit.items.delete(key);
      onSlipPreview?.(null);
    } else if (next.kind === 'slip') {
      const window = { startSec: shot.srcStart + next.deltaSec, endSec: shot.srcEnd + next.deltaSec };
      edit.items.set(key, { startSec: item.startSec, endSec: item.endSec, sourceIn: window.startSec, sourceOut: window.endSec, note: `${window.startSec.toFixed(1)}s – ${window.endSec.toFixed(1)}s` });
      onSlipPreview?.({ shotId: shot.id, ...window });
    } else {
      const sourceIn = next.edge === 'left' ? Math.max(0, shot.srcStart + (next.atSec - item.startSec) * rate) : shot.srcStart;
      const sourceOut = next.edge === 'right' ? shot.srcEnd + (next.atSec - item.endSec) * rate : shot.srcEnd;
      edit.items.set(key, next.edge === 'left'
        ? { startSec: Math.max(0, Math.min(next.atSec, item.endSec - 0.2)), endSec: item.endSec, sourceIn, sourceOut }
        : { startSec: item.startSec, endSec: Math.max(item.startSec + 0.2, next.atSec), sourceIn, sourceOut });
      onSlipPreview?.({ shotId: shot.id, startSec: Math.min(sourceIn, sourceOut - 0.05), endSec: Math.max(sourceOut, sourceIn + 0.05) });
    }
    requestPaint();
  };
  const slipShot = slipPanel ? layout.byKind.shot.find((item) => item.id === slipPanel) : undefined;
  const slipSourceSec = slipShot ? shotSourceDurations?.get(slipShot.id) : undefined;
  // The slip panel draws its strip as elements: while it is open it follows the thumbnails as they arrive.
  const slipStrips = useClipStrips(slipShot ? props.clipStripsStore : undefined);

  const pressShot = (event: React.PointerEvent, item: ItemOf<'shot'>, at: Point, edge: Edge | null, additive: boolean) => {
    const { shot } = item;
    if (onSlipButton(item, at)) {
      event.preventDefault();
      onSelectShot(shot.id, false);
      setSlipPanel((current) => (current === shot.id ? null : shot.id));
      return;
    }
    const key = liveKey(item);
    const start = item.startSec;
    const end = item.endSec;
    const rate = (shot.srcEnd - shot.srcStart) / Math.max(0.001, end - start); // source seconds per timeline second
    if (edge && onResizeShot) {
      onSelectShot(shot.id, false);
      // The head can open back to the source's first frame; on a packed spine that pushes what follows.
      const sourceFloor = rate > 0 ? start - shot.srcStart / rate : start;
      const previousEnd = shotsInOrder[item.index - 1]?.endSec ?? 0;
      const packedAtStart = Math.abs(previousEnd - start) < 0.001;
      let latest = edge === 'left' ? start : end;
      setEndResizeSec(end);
      drag(event, (clientX, clientY) => {
        const point = pointAt(clientX, clientY);
        const requested = snap(edge === 'left' ? point.rawSec : timelinePointerSecond(point.rawSec, dur, true));
        latest = edge === 'left'
          ? Math.max(packedAtStart ? sourceFloor : Math.max(0, sourceFloor, previousEnd), Math.min(requested, end - 0.2))
          : Math.max(start + 0.2, requested);
        const headRipple = edge === 'left' && packedAtStart && latest < start;
        const shownStart = edge === 'left' && !headRipple ? Math.max(0, sourceFloor, previousEnd, Math.min(latest, end - 0.2)) : start;
        const shownEnd = headRipple ? end + start - latest : edge === 'right' ? latest : end;
        const sourceIn = edge === 'left' ? shot.srcStart + (latest - start) * rate : shot.srcStart;
        const sourceOut = edge === 'right' ? shot.srcEnd + (shownEnd - end) * rate : shot.srcEnd;
        edit.items.set(key, { startSec: shownStart, endSec: shownEnd, sourceIn, sourceOut });
        setEndResizeSec(shownEnd);
        live.current.guideSec = latest;
        onSlipPreview?.({ shotId: shot.id, startSec: Math.min(Math.max(0, sourceIn), sourceOut - 0.05), endSec: Math.max(sourceOut, sourceIn + 0.05) });
      }, (moved) => {
        settle();
        onSlipPreview?.(null);
        if (moved) onResizeShot(shot.id, edge, latest);
        else click(item, at, additive);
      });
      return;
    }
    if (event.altKey && onSlipShot) {
      // Slip: the card stays put and the footage slides under it, following the pointer, so
      // dragging right shows earlier material. Kept inside the source at both ends.
      const sourceDurationSec = shotSourceDurations?.get(shot.id) ?? props.sourcePeaks?.get(shot.src ?? 'main')?.durationSec;
      let delta = 0;
      drag(event, (clientX, clientY) => {
        delta = Math.max(-shot.srcStart, -(pointAt(clientX, clientY).sec - at.sec) * rate);
        if (sourceDurationSec != null && sourceDurationSec > 0) delta = Math.min(delta, Math.max(0, sourceDurationSec - shot.srcEnd));
        const window = { startSec: shot.srcStart + delta, endSec: shot.srcEnd + delta };
        edit.items.set(key, { startSec: start, endSec: end, sourceIn: window.startSec, sourceOut: window.endSec, note: `${window.startSec.toFixed(1)}s – ${window.endSec.toFixed(1)}s` });
        onSlipPreview?.({ shotId: shot.id, ...window });
      }, (moved) => {
        settle();
        onSlipPreview?.(null);
        if (moved && Math.abs(delta) > 0.001) onSlipShot(shot.id, delta);
      });
      return;
    }
    if (!onMoveShot) { click(item, at, additive); return; }
    lift(event, item, at, true, (startSec, target) => onMoveShot(shot.id, startSec, target), () => click(item, at, additive));
  };

  const pressVisual = (event: React.PointerEvent, item: ItemOf<'visual'>, at: Point, edge: Edge | null) => {
    const { clip } = item;
    onSelectVisualClip?.(clip.clipId);
    if (edge && onResizeVisualClip) {
      // A video cannot be opened past the end of its source; an image has no end to run out of.
      const maximumEndSec = clip.kind === 'video' ? timelineSourceResizeEnd(clip.startSec, clip.endSec, clip.sourceInSec, clip.sourceOutSec, clip.sourceDurationSec) : Number.POSITIVE_INFINITY;
      let latest = edge === 'left' ? clip.startSec : clip.endSec;
      if (edge === 'right') setEndResizeSec(latest);
      drag(event, (clientX, clientY) => {
        latest = Math.min(maximumEndSec, snap(timelinePointerSecond(pointAt(clientX, clientY).rawSec, dur, edge === 'right')));
        edit.items.set(liveKey(item), edge === 'left'
          ? { startSec: Math.max(0, Math.min(latest, clip.endSec - 0.2)), endSec: clip.endSec }
          : { startSec: clip.startSec, endSec: Math.max(clip.startSec + 0.2, latest) });
        if (edge === 'right') setEndResizeSec(latest);
        live.current.guideSec = latest;
      }, (moved) => {
        settle();
        if (moved) onResizeVisualClip(clip.clipId, edge, latest);
        else onSeek(at.sec);
      });
      return;
    }
    if (!onMoveVisualClip) { onSeek(at.sec); return; }
    lift(event, item, at, clip.kind === 'video', (startSec, target) => onMoveVisualClip(clip.clipId, startSec, target), () => onSeek(at.sec));
  };

  const pressBlock = (event: React.PointerEvent, item: ItemOf<'block'>, at: Point, edge: Edge | null, additive: boolean) => {
    const block = item.block;
    const key = liveKey(item);
    const end = block.startSec + block.durationSec;
    if (edge) {
      let latest = { startSec: block.startSec, durationSec: block.durationSec };
      if (edge === 'right') setEndResizeSec(end);
      drag(event, (clientX, clientY) => {
        const point = pointAt(clientX, clientY);
        if (edge === 'left') {
          const startSec = Math.max(0, Math.min(end - MIN_DUR, snap(point.sec, [block.startSec])));
          latest = { startSec, durationSec: end - startSec };
        } else {
          const endSec = Math.max(block.startSec + MIN_DUR, snap(timelinePointerSecond(point.rawSec, dur, true), [end]));
          setEndResizeSec(endSec);
          latest = { startSec: block.startSec, durationSec: endSec - block.startSec };
        }
        edit.items.set(key, { startSec: latest.startSec, endSec: latest.startSec + latest.durationSec });
      }, (moved) => {
        settle();
        if (moved) onResizeBlock(block.id, latest.startSec, latest.durationSec);
        else click(item, at, additive);
      });
      return;
    }
    // The body moves it in time and, across lanes, onto another graphics lane or into a gap, where a
    // lane is made for it. Over a lane it cannot live on, it keeps the lane it last had.
    const grab = at.sec - block.startSec;
    let held: ({ startSec: number } & BlockMoveTarget) | null = null;
    drag(event, (clientX, clientY) => {
      if (additive) return;
      const point = pointAt(clientX, clientY);
      const startSec = snap(Math.max(0, point.sec - grab), [block.startSec, end]);
      const target: BlockMoveTarget = overHome(item, point.tracksYAt)
        ? { to: item.lane, gap: null }
        : (onMoveBlockTrack ? blockMoveTarget(layout, rows, point.tracksYAt, M.rowH, !!onMoveBlockNewTrack) : null) ?? { to: held?.to ?? item.lane, gap: null };
      held = { startSec, ...target };
      const top = (target.gap ? target.gap.top : layout.laneByKey.get(target.to)?.top ?? item.top - 4) + 4;
      edit.items.set(key, { startSec, endSec: startSec + block.durationSec, top, raised: target.gap != null || target.to !== item.lane });
      edit.line = target.gap ? { top: target.gap.lineTop, tone: 'graphic' } : null;
      setLifting(true);
    }, (moved) => {
      const dropped = held;
      settle();
      if (!moved) { click(item, at, additive); return; }
      if (!dropped) return;
      if (dropped.gap) onMoveBlockNewTrack?.(block.id, dropped.gap.newTrackIndex, dropped.startSec);
      else if (dropped.to !== item.lane) {
        const trackId = visualTrackIdOf(dropped.to);
        const stackOrder = trackId ? layout.laneByKey.get(dropped.to)?.stackOrder : dropped.to;
        if (typeof stackOrder === 'number') onMoveBlockTrack?.(block.id, { ...(trackId ? { trackId } : {}), stackOrder }, dropped.startSec);
      } else onMoveBlock(block.id, dropped.startSec);
    });
  };

  /** A caption's edges set when it shows; its words and where they come from stay as they are. */
  const pressCaption = (event: React.PointerEvent, item: ItemOf<'caption'>, at: Point, edge: Edge) => {
    if (!onResizeCaption) return;
    const block = item.block;
    const end = block.startSec + block.durationSec;
    const fps = Math.max(1, framePickFps);
    onSelectBlock(block.id, false);
    let latest = edge === 'left' ? block.startSec : end;
    if (edge === 'right') setEndResizeSec(end);
    drag(event, (clientX, clientY) => {
      const point = pointAt(clientX, clientY);
      if (edge === 'left') {
        latest = Math.max(0, Math.min(end - 1 / fps, quantizeTimelineFrameSecond(snap(point.sec, [block.startSec, end]), dur, framePickFps)));
        edit.items.set(liveKey(item), { startSec: latest, endSec: end });
      } else {
        latest = Math.max(block.startSec + 1 / fps, Math.round(snap(timelinePointerSecond(point.rawSec, dur, true), [block.startSec, end]) * fps) / fps);
        setEndResizeSec(latest);
        edit.items.set(liveKey(item), { startSec: block.startSec, endSec: latest });
      }
    }, (moved) => {
      settle();
      if (moved) onResizeCaption(block.id, edge, latest);
      else onSeek(at.sec);
    });
  };

  // An audio chip: its mute switch, a knee per fade, an edge to trim, and its body to move it in
  // time or onto another audio lane (or between lanes, where one is made for it).
  const audioZone = (item: ItemOf<'audio'>, at: Point) => audioZoneAt(
    audioChip(item.clip, dur, pps, surfaceWidth / pps), item.top, at.contentX, at.tracksYAt,
    { mute: !!onToggleAudioClipMute, fade: !!onFadeAudio, trim: !!onTrimAudio },
  );
  const pressAudio = (event: React.PointerEvent, item: ItemOf<'audio'>, at: Point) => {
    const base = item.clip;
    const key = liveKey(item);
    const window = audioClipWindow(base, dur);
    const zone = audioZone(item, at);
    if (zone === 'mute') {
      event.preventDefault();
      onToggleAudioClipMute?.(base.id, !base.muted);
      return;
    }
    /** The chip as a patch would leave it. */
    const show = (patch: Partial<typeof base>, top?: number) => {
      const next = audioClipWindow({ ...base, ...patch }, dur);
      edit.items.set(key, { startSec: next.start, endSec: Math.max(next.start + 0.05, next.end), audio: patch, top });
      return next;
    };
    if (zone === 'fade-in' || zone === 'fade-out') {
      const edge = zone === 'fade-in' ? 'in' : 'out';
      const defaults = audioClipDefaults(base);
      const span = Math.max(0.05, window.end - window.start);
      let sec = edge === 'in' ? defaults.fadeInSec : defaults.fadeOutSec;
      drag(event, (clientX, clientY) => {
        const second = pointAt(clientX, clientY).sec;
        sec = Math.round(Math.max(0, Math.min(span, AUDIO_FADE_MAX_SEC, edge === 'in' ? second - window.start : window.end - second)) * 10) / 10;
        show(edge === 'in' ? { fadeInSec: sec } : { fadeOutSec: sec });
      }, (moved) => {
        settle();
        onSelectAudio?.(base.id);
        if (moved) onFadeAudio?.(base.id, edge, sec);
      });
      return;
    }
    if (zone === 'left' || zone === 'right') {
      // Always measured from the clip as it was, so the edge follows the pointer without drift.
      let patch = audioTrimPatch(base, zone, zone === 'left' ? window.start : window.end);
      if (zone === 'right') setEndResizeSec(window.end);
      drag(event, (clientX, clientY) => {
        const point = pointAt(clientX, clientY);
        patch = audioTrimPatch(base, zone, Math.max(0, snap(zone === 'right' ? timelinePointerSecond(point.rawSec, dur, true) : point.sec, [window.start, window.end])));
        const next = show(patch);
        if (zone === 'right') setEndResizeSec(next.end);
      }, (moved) => {
        settle();
        onSelectAudio?.(base.id);
        if (moved) onTrimAudio?.(base.id, patch);
      });
      return;
    }
    const grab = at.sec - window.start;
    let startSec = window.start;
    let target: AudioMoveTarget | undefined;
    drag(event, (clientX, clientY) => {
      const point = pointAt(clientX, clientY);
      startSec = Math.max(0, Math.min(Math.max(0, dur - 0.2), snap(point.sec - grab, [window.start, window.end])));
      if (startSec < 0.15) startSec = 0; // the head of the project pulls it in
      target = overHome(item, point.tracksYAt) ? undefined : audioMoveTarget(layout, rows, point.tracksYAt, M.audioRowH) ?? undefined;
      show({ startSec }, target ? target.top + 2 : item.top);
      edit.line = target?.kind === 'new-track' ? { top: target.lineTop, tone: 'media' } : null;
    }, (moved) => {
      settle();
      onSelectAudio?.(base.id);
      if (moved) onMoveAudio?.(base.id, startSec, target);
      else onOpenMusicPanel?.();
    });
  };

  // A transition: its body moves it between its neighbours, a grip at either end resizes it. One on
  // a cut stays centred there, so either grip opens both sides alike.
  const transitionZone = (item: ItemOf<'transition'>, contentX: number): 'l' | 'r' | 'move' => {
    const box = itemBox(item, pps);
    const grip = Math.min(8, box.width / 2);
    return contentX >= box.left + box.width - grip ? 'r' : contentX <= box.left + grip ? 'l' : 'move';
  };
  const pressTransition = (event: React.PointerEvent, item: ItemOf<'transition'>, at: Point) => {
    const { transition } = item;
    const mode = transitionZone(item, at.contentX);
    onSelectTransition?.(transition.id);
    const start = transition.startSec;
    const length = transition.endSec - transition.startSec;
    const others = (transitions ?? []).filter((other) => other.id !== transition.id);
    const floor = Math.max(0, ...others.filter((other) => other.endSec <= start + 1e-6).map((other) => other.endSec));
    const ceiling = Math.min(Number.POSITIVE_INFINITY, ...others.filter((other) => other.startSec >= start + length - 1e-6).map((other) => other.startSec));
    const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
    let next = { startSec: start, durationSec: length };
    drag(event, (clientX, clientY) => {
      const delta = pointAt(clientX, clientY).rawSec - at.rawSec;
      if (mode === 'move') next = { startSec: clamp(start + delta, floor, ceiling - length), durationSec: length };
      else if (transition.cut) {
        const cut = transition.cut.atSec;
        const edge = mode === 'l' ? start + delta : start + length + delta;
        const room = Math.min(MAX_TRANSITION_SEC / 2, cut - Math.max(floor, transition.cut.minSec), Math.min(ceiling, transition.cut.maxSec) - cut);
        const half = clamp(Math.abs(edge - cut), Math.min(0.05, room), room);
        next = { startSec: cut - half, durationSec: half * 2 };
      } else if (mode === 'r') next = { startSec: start, durationSec: clamp(length + delta, 0.1, Math.min(MAX_TRANSITION_SEC, ceiling - start)) };
      else {
        const from = clamp(start + delta, Math.max(floor, start + length - MAX_TRANSITION_SEC), start + length - 0.1);
        next = { startSec: from, durationSec: start + length - from };
      }
      edit.items.set(liveKey(item), { startSec: next.startSec, endSec: next.startSec + next.durationSec });
    }, (moved) => {
      settle();
      if (moved) onChangeTransition?.(transition.id, next);
    });
  };

  // ---- reordering lanes from their headers ------------------------------------------------------
  const [laneDrag, setLaneDrag] = useState<{ key: TimelineLane['key']; dy: number } | null>(null);
  const reorderable = useMemo(() => layout.lanes.filter((lane) => lane.trackId != null && lane.track), [layout]);
  const startLaneDrag = (event: React.PointerEvent, lane: TimelineLane) => {
    if (event.button !== 0 || reorderable.length <= 1) return;
    event.preventDefault();
    const fromIndex = reorderable.indexOf(lane);
    const others = reorderable.filter((candidate) => candidate !== lane);
    const startY = event.clientY;
    let toIndex = fromIndex;
    const move = (next: PointerEvent) => {
      if (next.buttons === 0) { end(); return; }
      const dy = next.clientY - startY;
      const centre = lane.top + lane.height / 2 + dy;
      toIndex = others.filter((candidate) => centre > candidate.top + candidate.height / 2).length;
      // Nothing goes above the caption lane: it is pinned on top of the stack.
      const captions = others.findIndex((candidate) => candidate.key === CAP_LANE);
      if (captions >= 0 && toIndex <= captions) toIndex = captions + 1;
      const before = others[toIndex];
      const last = others.at(-1);
      edit.line = toIndex === fromIndex ? null : { top: before ? before.top - M.rowGap / 2 : last ? last.top + last.height + M.rowGap / 2 : lane.top, tone: 'graphic' };
      setLaneDrag({ key: lane.key, dy });
      requestPaint();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setLaneDrag(null);
      edit.line = null;
      requestPaint();
      if (toIndex === fromIndex) return;
      const order = [...others];
      order.splice(toIndex, 0, lane);
      onReorderTracks(order.map((entry) => ({ trackId: entry.trackId!, stackOrder: entry.track?.stackOrder ?? 0 })));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // ---- something dragged in from a panel ---------------------------------------------------------
  // Audio lands on the audio lane at the pointer's second; a graphic anywhere but the story lane; a
  // video or image on the lane under the pointer, or a new one in a gap. On the story lane a clip is
  // slotted into the order (the lane stays packed); elsewhere it covers what is there, and with
  // ⌘/Ctrl held it pushes later clips along instead.
  const planDrop = (event: React.DragEvent) => {
    const at = pointAt(event.clientX, event.clientY);
    const rawSec = snap(at.sec);
    if (assetDragKind === 'audio') return { sec: rawSec, target: 'audio' as const, mode: 'overwrite' as TimelineInsertMode };
    if (assetDragKind === 'element') return laneAt(at.tracksYAt)?.key === 0 ? null : { sec: rawSec, target: 'block' as const, mode: 'overwrite' as TimelineInsertMode };
    if (assetDragKind !== 'image' && assetDragKind !== 'video') return null;
    const target = visualMoveTarget(layout, rows, at.tracksYAt, assetDragKind === 'video', M.visualSceneH);
    if (target.kind === 'primary' && snapEnabled) {
      const spans = shotsInOrder.map((shot) => ({ id: shot.id, startSec: shot.startSec, endSec: shot.endSec }));
      const packed = packedPrimaryPlacement(spans, '__external_asset__', rawSec, assetDragKind === 'image' ? 5 : 3);
      return { sec: packed.startSec, target: { kind: 'primary', insertIndex: packed.index } as TimelineMediaDropTarget, mode: 'ripple' as TimelineInsertMode };
    }
    return { sec: rawSec, target, mode: (event.metaKey || event.ctrlKey ? 'ripple' : 'overwrite') as TimelineInsertMode };
  };
  const clearDrop = () => {
    edit.drop = null;
    edit.line = null;
    live.current.guideSec = null;
    requestPaint();
  };
  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    const plan = planDrop(event);
    event.dataTransfer.dropEffect = plan ? 'copy' : 'none';
    if (!plan) { clearDrop(); return; }
    const media = typeof plan.target === 'object' ? plan.target : null;
    const top = media?.kind === 'primary' ? (layout.laneByKey.get(0)?.top ?? 0) + M.scenePadT
      : media?.kind === 'visual' ? (layout.lanes.find((lane) => lane.trackId === media.trackId)?.top ?? 0) + M.visualScenePadT
      : media ? insertionLineTop(rows, media.slot) + M.visualScenePadT
      : 0;
    edit.drop = {
      sec: plan.sec,
      label: media
        ? `${t(plan.mode === 'ripple' ? 'panels.rippleInsert' : 'panels.overwritePlace')} · ${plan.sec.toFixed(1)}s${media.kind === 'visual-new' ? ` · ${t('panels.newVisualTrack')}` : ''}`
        : t('panels.insertSecS', { sec: plan.sec.toFixed(1) }),
      box: media ? { top, height: media.kind === 'primary' ? (layout.sceneRail ? M.sceneH : M.rowH) - M.scenePadT - M.scenePadB : M.visualSceneH - M.visualScenePadT - M.visualScenePadB, durationSec: assetDragKind === 'image' ? 5 : 3 } : null,
    };
    edit.line = media?.kind === 'visual-new' ? { top: insertionLineTop(rows, media.slot), tone: 'media' } : null;
    live.current.guideSec = null; // the drop line already marks the second
    requestPaint();
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const plan = planDrop(event);
    clearDrop();
    if (!plan) return;
    if (plan.target === 'audio') onDropAssetAudio?.(plan.sec);
    else if (plan.target === 'block') onDropAsset?.(plan.sec);
    else onDropAssetClip?.(plan.sec, plan.target, plan.mode);
  };
  useEffect(() => {
    if (!assetDragging) { live.current.edit.drop = null; live.current.edit.line = null; live.current.guideSec = null; }
  }, [assetDragging]);

  /** Empty lane: a drag selects what its rectangle touches (shots from the story lane, graphics from
   *  anywhere else); a press let go clears the selection and puts the playhead there. */
  const pressEmpty = (event: React.PointerEvent, at: Point) => {
    const lane = laneAt(at.tracksYAt);
    const spine = lane?.key === 0 ? lane : null;
    let box: NonNullable<typeof edit.marquee> | null = null;
    drag(event, (clientX, clientY) => {
      const point = pointAt(clientX, clientY);
      box = {
        left: Math.min(at.contentX, point.contentX), right: Math.max(at.contentX, point.contentX),
        top: spine ? spine.top + 12 : Math.min(at.tracksYAt, point.tracksYAt), bottom: spine ? spine.top + spine.height - 8 : Math.max(at.tracksYAt, point.tracksYAt),
      };
      edit.marquee = box;
    }, (moved) => {
      const drawn = box;
      settle();
      if (!moved || !drawn) {
        if (lane?.audio) onSelectAudio?.(null);
        else onDeselectAll();
        onSeek(at.sec);
        return;
      }
      const across = (item: TimelineItem) => item.startSec * pps < drawn.right && item.endSec * pps > drawn.left;
      if (spine) onBoxSelectShots(layout.byKind.shot.filter(across).map((item) => item.id));
      else onBoxSelectBlocks(layout.byKind.block.filter((item) => item.block.trackIndex > 0 && across(item) && item.top < drawn.bottom && item.top + item.height > drawn.top).map((item) => item.id));
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const at = pointAt(event.clientX, event.clientY);
    if (framePickActive) {
      event.preventDefault();
      const second = quantizeTimelineFrameSecond(at.sec, dur, framePickFps);
      live.current.hoverSec = second;
      onSeek(second);
      onScrub(null);
      onPickFrame?.(second);
      requestPaint();
      return;
    }
    // The playhead is grabbed anywhere along its line, over whatever lies under it.
    if (Math.abs(at.contentX - playhead.get() * pps) <= PLAYHEAD_GRAB_PX) {
      const grabOffset = at.rawSec - playhead.get();
      let lock: number | null = null;
      drag(event, (clientX, clientY) => {
        const result = snapPlayhead(draggedPlayheadSecond(pointAt(clientX, clientY).rawSec, grabOffset, dur), lock);
        lock = result.hit;
        onSeek(result.second);
      });
      return;
    }
    if (at.inRuler) {
      let lock: number | null = null;
      const seek = (clientX: number, clientY: number) => {
        const result = snapPlayhead(pointAt(clientX, clientY).sec, lock);
        lock = result.hit;
        onSeek(result.second);
      };
      seek(event.clientX, event.clientY);
      drag(event, seek);
      return;
    }
    const item = itemAt(at.contentX, at.tracksYAt);
    const additive = event.metaKey || event.ctrlKey;
    if (!item) { pressEmpty(event, at); return; }
    const edge = trimEdge(item, at.contentX);
    switch (item.kind) {
      case 'shot': pressShot(event, item, at, edge, additive); break;
      case 'visual': pressVisual(event, item, at, edge); break;
      case 'block': pressBlock(event, item, at, edge, additive); break;
      case 'caption':
        if (edge) pressCaption(event, item, at, edge);
        else click(item, at, additive);
        break;
      case 'audio': pressAudio(event, item, at); break;
      case 'transition':
        if (onChangeTransition) pressTransition(event, item, at);
        else click(item, at, additive);
        break;
      default: click(item, at, additive);
    }
  };

  // ---- zoom: ctrl/⌘ + wheel, the second under the pointer stays under it ------------------------
  const zoomAnchor = useRef<{ second: number; x: number } | null>(null);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // Where the pointer is across the visible lanes: the second there keeps that place.
      const x = event.clientX - host.getBoundingClientRect().left - GUTTER;
      zoomAnchor.current = { second: Math.max(0, (x - EDGE_PAD + host.scrollLeft) / ppsRef.current), x };
      onPps((current) => Math.max(MIN_PPS, Math.min(MAX_PPS, current * (event.deltaY < 0 ? 1.1 : 0.9))));
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [onPps]);
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const host = scrollRef.current;
    zoomAnchor.current = null;
    if (anchor && host) host.scrollLeft = Math.max(0, EDGE_PAD + anchor.second * pps - anchor.x);
  }, [pps]);

  // ---- following the playhead -------------------------------------------------------------------
  const follow = useRef({ on: true, programmaticUntil: 0, lastLeft: 0 });
  const playheadX = () => GUTTER + EDGE_PAD + playhead.get() * ppsRef.current; // in scroll coordinates
  const playheadOnScreen = () => {
    const host = scrollRef.current;
    if (!host) return true;
    return playheadX() >= host.scrollLeft + GUTTER && playheadX() <= host.scrollLeft + host.clientWidth - 8;
  };
  /** Scroll so the playhead lands at this fraction of the visible lanes (0.1 = lead-in, 0.5 = centre). */
  const scrollToPlayhead = (lead: number) => {
    const host = scrollRef.current;
    if (!host) return;
    follow.current.programmaticUntil = performance.now() + 150;
    host.scrollLeft = Math.max(0, playheadX() - GUTTER - (host.clientWidth - GUTTER) * lead);
  };
  useEffect(() => {
    if (!playing) return;
    follow.current.on = true;
    let checked = 0;
    const step = () => {
      if (!follow.current.on) return;
      const now = performance.now();
      if (now - checked < 250) return;
      checked = now;
      if (!playheadOnScreen()) scrollToPlayhead(0.1);
    };
    step();
    return playhead.subscribe(step);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the two helpers read refs only
  }, [playing]);
  const firstLocate = useRef(true);
  const locateNearRef = useRef(locateNear);
  locateNearRef.current = locateNear;
  useEffect(() => {
    if (firstLocate.current) { firstLocate.current = false; return; }
    if (locateNearRef.current && playheadOnScreen()) return;
    scrollToPlayhead(0.5);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the two helpers read refs only
  }, [locateSignal]);

  // ---- thumbnails wanted for what is on screen --------------------------------------------------
  const [visibleRange, setVisibleRange] = useState({ startSec: 0, endSec: 30 });
  const updateVisibleRange = useCallback(() => {
    const host = scrollRef.current;
    if (!host) return;
    const windowSec = Math.max(1, (host.clientWidth - GUTTER) / pps);
    const rawStart = Math.max(0, (host.scrollLeft - EDGE_PAD) / pps);
    const rawEnd = Math.min(dur, (host.scrollLeft + host.clientWidth - GUTTER - EDGE_PAD) / pps);
    // Half-window buckets with a window of overscan: thumbnails are asked for before they scroll in,
    // and not again on every pixel.
    const bucket = Math.max(1, windowSec / 2);
    const startSec = Math.max(0, Math.floor(rawStart / bucket) * bucket - windowSec);
    const endSec = Math.min(dur, Math.ceil(rawEnd / bucket) * bucket + windowSec);
    setVisibleRange((current) => (current.startSec === startSec && current.endSec === endSec ? current : { startSec, endSec }));
  }, [dur, pps]);
  useEffect(updateVisibleRange, [updateVisibleRange, view.width]);
  const demandKey = useRef('');
  useEffect(() => {
    if (!onFilmstripDemandChange) return;
    const demand: Record<string, FilmstripSourceRange[]> = {};
    const want = (source: string | undefined, startSec: number, endSec: number, sourceIn: number, sourceOut: number) => {
      if (!source) return;
      const range = filmstripSourceRangeForTimelineWindow(startSec, endSec, sourceIn, sourceOut, visibleRange.startSec, visibleRange.endSec);
      if (range) (demand[source] ??= []).push(range);
    };
    for (const item of layout.byKind.shot) want(item.shot.src, item.startSec, item.endSec, item.shot.srcStart, item.shot.srcEnd);
    for (const item of layout.byKind.visual) if (item.clip.kind === 'video' && !item.clip.usePrimaryFilmstrip) want(item.clip.source, item.startSec, item.endSec, item.clip.sourceInSec, item.clip.sourceOutSec);
    const key = JSON.stringify(demand);
    if (key === demandKey.current) return;
    demandKey.current = key;
    onFilmstripDemandChange(demand);
  }, [onFilmstripDemandChange, layout, visibleRange, shotSourceDurations]);

  // Thumbnails that arrive are painted; nothing renders for them.
  const stripsStore = props.clipStripsStore;
  useEffect(() => stripsStore?.subscribe(() => { painted.current.stale = true; requestPaint(); }), [stripsStore, requestPaint]);

  const onScroll = () => {
    const host = scrollRef.current;
    if (!host) return;
    // The canvases move with the lanes on their own; a frame only checks whether the window is
    // still inside what is painted.
    requestOverlay();
    updateVisibleRange();
    const moved = host.scrollLeft !== follow.current.lastLeft; // a vertical scroll is not the user leaving the playhead
    follow.current.lastLeft = host.scrollLeft;
    if (performance.now() < follow.current.programmaticUntil) return;
    if (playing && moved) follow.current.on = false;
  };

  return (
    <div className="bg-panel flex max-h-96 min-h-0 flex-col">
      <div ref={scrollRef} data-timeline-canvas
        className={`relative min-h-0 flex-1 overflow-auto ${dropActive ? 'ring-accent/60 ring-2 ring-inset' : framePickActive ? 'ring-accent/45 ring-1 ring-inset' : ''}`}
        onScroll={onScroll}
        onDragOver={dropActive ? onDragOver : undefined}
        // Leaving a child is not leaving the timeline: the plan clears only when the pointer is outside it.
        onDragLeave={dropActive ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDrop(); } : undefined}
        onDrop={dropActive ? onDrop : undefined}>
        {/* The canvases stay at the top of the lanes and move sideways with them; each paint places
            them (left and width) around the window. The sized box under them gives the scrollbars their range. */}
        <div className="sticky top-0 z-0 h-0 w-0">
          <canvas ref={baseRef} className="pointer-events-none absolute top-0 block" style={{ left: GUTTER, height: view.height }} />
          <canvas
            ref={canvasRef}
            data-timeline-pointer
            className="absolute top-0 block touch-none select-none"
            style={{ left: GUTTER, height: view.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={endScrub}
          />
        </div>
        <div className="flex" style={{ width: GUTTER + EDGE_PAD * 2 + surfaceWidth, height: M.rulerH + topInset + tracksHeight }}>
          <div className="bg-panel sticky left-0 z-10 shrink-0" style={{ width: GUTTER }}>
            <div className="border-line bg-panel sticky top-0 z-10 border-b" style={{ height: M.rulerH }} />
            {topInset > 0 && <div className="border-line text-ink-4 flex items-center gap-1 border-b px-2 text-[9px]" style={{ height: topInset }} title={t('panels.directorPlan')} />}
            <div className="relative">
              {layout.lanes.map((lane) => <LaneHeader key={String(lane.key)} lane={lane} sceneRail={layout.sceneRail} empty={dur <= 0}
                onDragStart={lane.track && lane.trackId != null && lane.key !== CAP_LANE && reorderable.length > 1 ? (event) => startLaneDrag(event, lane) : undefined}
                dragOffset={laneDrag?.key === lane.key ? laneDrag.dy : null}
                videoMuted={videoMuted} onToggleVideoMute={onToggleVideoMute} videoHidden={videoHidden} onToggleVideoHidden={onToggleVideoHidden}
                audioMuted={audioMuted} onToggleAudioMute={onToggleAudioMute} onToggleTrackMute={onToggleTrackMute} onToggleTrackHidden={onToggleTrackHidden} />)}
              {layout.transitionLane && (
                <div title={t('workbench.transitionLane')} className="text-ink-4 absolute right-0 left-0 flex items-center gap-1 px-2 text-[10px]" style={{ top: layout.transitionLane.top, height: layout.transitionLane.height }}>
                  <ArrowLeftRight size={12} className="shrink-0" aria-hidden />
                </div>
              )}
            </div>
          </div>
        </div>
        {/* The director strip keeps its own elements: it is an admin view, a few boxes wide. */}
        {topInset > 0 && directorScenes && (
          <div className="absolute z-[5]" style={{ left: GUTTER + EDGE_PAD, top: M.rulerH, width: surfaceWidth }}>
            <DirectorSceneStrip scenes={directorScenes} pps={pps} onSeek={onSeek} />
          </div>
        )}
        {slipShot && slipSourceSec && onSlipShot && scrollRef.current && (
          <TimelineSlipPanel
            shot={{ id: slipShot.id, srcStart: slipShot.shot.srcStart, srcEnd: slipShot.shot.srcEnd }} startSec={slipShot.startSec} endSec={slipShot.endSec}
            sourceDurationSec={slipSourceSec} strip={(slipShot.shot.src ? (props.clipStripsStore ? slipStrips : props.clipStrips)?.[slipShot.shot.src] : props.filmstrip) ?? []} pps={pps} host={scrollRef.current}
            onLive={(next) => slipLive(slipShot, next)} onSlip={(deltaSec) => onSlipShot(slipShot.id, deltaSec)}
            onTrim={onResizeShot ? (edge, atSec) => onResizeShot(slipShot.id, edge, atSec) : undefined}
            onClose={() => setSlipPanel(null)}
            // A press on the shot's own button toggles the panel itself: closing here first would open it again.
            keepOpen={(event) => { if (event.target !== canvasRef.current) return false; const at = pointAt(event.clientX, event.clientY); const item = itemAt(at.contentX, at.tracksYAt); return !!item && item.id === slipShot.id && onSlipButton(item, at); }}
          />
        )}
        {/* The kind icons as the browser draws them, for the canvas to copy. */}
        <div ref={iconsRef} hidden>
          {BLOCK_KINDS.map((kind) => { const Icon = KIND_META[kind].icon; return <span key={kind} data-kind={kind}><Icon size={22} /></span>; })}
          {GLYPHS.map(([name, Icon, tone]) => <span key={name} data-glyph={name} data-tone={tone}><Icon size={22} /></span>)}
          {transitionEffects.split('|').map((effect) => { const Icon = transitionIcon(effect || undefined); return <span key={effect} data-glyph={`transition:${effect}`} data-tone="onAccent"><Icon size={22} /></span>; })}
        </div>
      </div>
    </div>
  );
}

/** A lane's header in the sticky left column: what it holds, and its mute and visibility switches. */
function LaneHeader({ lane, sceneRail, empty, onDragStart, dragOffset, videoMuted, onToggleVideoMute, videoHidden, onToggleVideoHidden, audioMuted, onToggleAudioMute, onToggleTrackMute, onToggleTrackHidden }: {
  lane: TimelineLane; sceneRail: boolean; empty: boolean;
  /** Present on a lane that can be moved among the others. */
  onDragStart?: (event: React.PointerEvent) => void;
  /** How far the header has been dragged, while it is. */
  dragOffset: number | null;
} & Pick<StudioTimelineProps, 'videoMuted' | 'onToggleVideoMute' | 'videoHidden' | 'onToggleVideoHidden' | 'audioMuted' | 'onToggleAudioMute' | 'onToggleTrackMute' | 'onToggleTrackHidden'>) {
  const main = lane.key === 0;
  const track = lane.track;
  const meta = lane.key === CAP_LANE
    ? KIND_META.caption
    : lane.audio
      ? track?.role === 'sfx'
        ? { label: 'panels.sfxTrack', icon: Volume2, dot: 'text-accent-ink' }
        : track?.role === 'narration'
          ? { label: 'panels.narrationTrack', icon: Volume2, dot: 'text-accent-ink' }
          : { label: track?.role === 'music' ? 'panels.musicTrack' : 'panels.musicBed', icon: Music, dot: 'text-accent-ink' }
      : visualTrackIdOf(lane.key) && lane.kind === 'video'
        ? { label: 'panels.multimediaTrack', icon: Film, dot: 'text-accent-ink' }
        : lane.kind === 'video'
          ? { label: sceneRail ? 'panels.scene' : 'panels.video', icon: Film, dot: 'text-accent-ink' }
          : KIND_META[lane.kind];
  const Icon = meta.icon;
  const blank = <span className="h-4 w-4" aria-hidden />;
  const audioId = audioTrackIdOf(lane.key);
  return (
    <div title={t(meta.label)} onPointerDown={onDragStart}
      className={`absolute right-0 left-0 grid grid-cols-[16px_16px_16px] items-center gap-0.5 px-2 text-[11px] ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOffset != null ? 'bg-panel-2 z-10 rounded' : ''}`}
      style={{ top: lane.top, height: lane.height, transform: dragOffset != null ? `translateY(${dragOffset}px)` : undefined }}>
      <span className="flex h-4 w-4 items-center justify-center" aria-hidden><Icon size={13} className={meta.dot} /></span>
      {main && empty ? blank
        : main && onToggleVideoMute ? <MuteToggle muted={!!videoMuted} onToggle={onToggleVideoMute} />
        : audioId && track && onToggleTrackMute ? <MuteToggle muted={track.muted} onToggle={() => onToggleTrackMute(track.trackId)} />
        : audioId && onToggleAudioMute ? <MuteToggle muted={!!audioMuted} onToggle={onToggleAudioMute} />
        : track?.clips?.some((clip) => clip.kind === 'video') && onToggleTrackMute ? <MuteToggle muted={track.muted} onToggle={() => onToggleTrackMute(track.trackId)} />
        : blank}
      {main && empty ? blank
        : main && onToggleVideoHidden ? <VisibilityToggle hidden={!!videoHidden} onToggle={onToggleVideoHidden} />
        : track && onToggleTrackHidden ? <VisibilityToggle hidden={track.hidden} onToggle={() => onToggleTrackHidden(track.trackId)} />
        : blank}
    </div>
  );
}
