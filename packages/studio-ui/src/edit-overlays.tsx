'use client';

/**
 * Stage edit overlays: the selection/handle chrome drawn OVER the preview iframe.
 * BoxEditOverlay = the selected block's box shell (move/trim/scale/rotate handles);
 * CaptionEditOverlay = global caption position/size handles. Both follow ghost semantics —
 * content never updates live during a drag; the commit applies once on release.
 */

import { useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { type CaptionStyle, getCaptionPreset } from '@pireel/studio-engine/composition';
import { t } from './i18n';
import { startPointerDrag } from './drag-shell';

/**
 * Frame-level box manipulation shell for the selected block (geometry = the Block.box layout rectangle).
 * Crop vs. scale division (per user): the border thin strip = move; the mid-edge bar handles = trim that edge (opposite
 * edge anchored, content anchored to canvas, no reflow); the corner dots = proportional scale (window/content/font all ×k, diagonal anchored).
 * Font size itself isn't tuned here (that's the font's job).
 * The drag itself isn't here — unified ghost semantics (like caption handles, per user): the baseline solid line stays,
 * the dashed ghost follows the pointer (setGhostRect writes DOM directly), content doesn't update live, and after committing
 * to Block on release it's applied once via the rebuild-free channel (see workbench's gripDrag/edgeDrag/scaleDrag and the boxDrag message handling).
 * Hollow inside (pointer-events:none) — doesn't block click-to-select / click-text-to-edit inside the iframe.
 */
export function BoxEditOverlay({
  box,
  stageW,
  stageH,
  rotation,
  overlayRef,
  labelRef,
  onMovePointerDown,
  onEdgePointerDown,
  onScalePointerDown,
  onRotatePointerDown,
}: {
  box: { x: number; y: number; w: number; h: number };
  stageW: number;
  stageH: number;
  /** Current rotation angle (degrees): the whole selection box rotates with it, handles hug the rotated component. */
  rotation?: number;
  /** Selection box root ref: during rotate drag the parent sets its transform directly (handles follow, not via React state). */
  overlayRef?: React.Ref<HTMLDivElement>;
  /** Angle number ref: during rotate drag the parent sets its textContent / upright compensation directly. */
  labelRef?: React.Ref<HTMLSpanElement>;
  onMovePointerDown: (e: React.PointerEvent) => void;
  /** Edge handle: stretch only this axis's box size (opposite edge anchored), content reflows to fill — no crop, no locked ratio. */
  onEdgePointerDown: (e: React.PointerEvent, side: 'l' | 'r' | 't' | 'b') => void;
  /** Corner handle: proportional scale (window/content/font together, diagonal anchored). */
  onScalePointerDown: (e: React.PointerEvent, sgnX: 1 | -1, sgnY: 1 | -1) => void;
  /** Bottom rotate handle: rotate the whole thing around the center. */
  onRotatePointerDown: (e: React.PointerEvent) => void;
}) {
  const edge = 'pointer-events-auto absolute';
  // White-fill outlined dots/bars: readable on both light and dark frames
  const knob = 'pointer-events-auto absolute rounded-full border-2 border-accent bg-white shadow';
  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute z-30"
      style={{
        left: box.x * stageW,
        top: box.y * stageH,
        width: box.w * stageW,
        height: box.h * stageH,
        // The whole selection box rotates with the component (handles hug the rotated card)
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div className="absolute inset-0 rounded-md ring-2 ring-accent/80" />
      {/* A blue line + rotate handle attached below center (drag to rotate around the center, live) */}
      <div className="pointer-events-none absolute left-1/2 top-full flex -translate-x-1/2 flex-col items-center">
        <div className="bg-accent w-px" style={{ height: 22 }} />
        <button
          type="button"
          onPointerDown={onRotatePointerDown}
          title={t('workbench.dragRotateHoldShift')}
          aria-label={t('common.rotate')}
          className="border-accent text-accent pointer-events-auto -mt-px flex h-5 w-5 cursor-grab items-center justify-center rounded-full border-2 bg-white shadow active:cursor-grabbing"
        >
          <RotateCw size={11} />
        </button>
        {/* Current angle (live during drag; shown when committed non-zero). Counter-rotation keeps the number upright */}
        <span
          ref={labelRef}
          className="bg-accent mt-1 rounded px-1 py-0.5 font-mono text-[9px] leading-none text-white whitespace-nowrap"
          style={{ display: rotation ? 'block' : 'none', transform: rotation ? `rotate(${-rotation}deg)` : undefined }}
        >
          {rotation ? `${Math.round(rotation)}°` : ''}
        </span>
      </div>
      {/* Four edges: drag to move (thin strips, hollow center for the iframe) */}
      <div className={`${edge} -top-1 left-0 right-0 h-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -bottom-1 left-0 right-0 h-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -left-1 bottom-0 top-0 w-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -right-1 bottom-0 top-0 w-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      {/* Mid-edge bar handles: stretch only this axis (opposite edge anchored, content reflows to fill; no crop, no locked ratio) */}
      <div className={`${knob} top-1/2 -right-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('workbench.resizeWidth')} onPointerDown={(e) => onEdgePointerDown(e, 'r')} />
      <div className={`${knob} top-1/2 -left-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('workbench.resizeWidth')} onPointerDown={(e) => onEdgePointerDown(e, 'l')} />
      <div className={`${knob} left-1/2 -bottom-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('workbench.resizeHeight')} onPointerDown={(e) => onEdgePointerDown(e, 'b')} />
      <div className={`${knob} left-1/2 -top-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('workbench.resizeHeight')} onPointerDown={(e) => onEdgePointerDown(e, 't')} />
      {/* Corner dots: proportional scale (window/content/font together, diagonal anchored) */}
      <div className={`${knob} -top-[7px] -left-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('workbench.scaleProportionally')} onPointerDown={(e) => onScalePointerDown(e, -1, -1)} />
      <div className={`${knob} -top-[7px] -right-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('workbench.scaleProportionally')} onPointerDown={(e) => onScalePointerDown(e, 1, -1)} />
      <div className={`${knob} -bottom-[7px] -left-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('workbench.scaleProportionally')} onPointerDown={(e) => onScalePointerDown(e, -1, 1)} />
      <div className={`${knob} -bottom-[7px] -right-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('workbench.scaleProportionally')} onPointerDown={(e) => onScalePointerDown(e, 1, 1)} />
    </div>
  );
}

/**
 * Global position/size handles for sentence-level captions: select any caption — **the whole box body is draggable** (free two-axis move);
 * the left/right mid-edge handles + corners = adjust line width (segmentation is computed from line width, **font size unchanged**, text-box semantics); font size
 * lives in the captions panel's per-line style row (the on-canvas toolbar was removed — handles only here).
 * **All captions move together** (Vids Captions semantics, no per-caption tweak).
 * The box is just the approximate placement of caption lines under the current style (positioning aligns to renderLine's bottom:yPct% / left:xPct%);
 * the caption-word editing surface is in the smart-narration panel, and the box body covers the preview without blocking any editing path.
 */
export function CaptionEditOverlay({
  style,
  compH,
  stageW,
  stageH,
  measured,
  lines,
  onChange,
  onLive,
}: {
  style: CaptionStyle;
  compH: number;
  stageW: number;
  stageH: number;
  /** iframe-measured caption line rect (w/h normalized + scale at measure time): before a measurement, falls back to an estimated band. */
  measured: { w: number; h: number; scale: number } | null;
  /** Visual line count (cue blocks stack lines at large font sizes): multiplies the analytic text height so the box tracks size changes instantly. Default 1. */
  lines?: number;
  onChange: (patch: Partial<CaptionStyle>) => void;
  /** Live preview during drag (zero setState, same as the component hf:boxSize contract): workbench sends hf:capStyle to edit the iframe directly. */
  onLive: (style: CaptionStyle) => void;
}) {
  const lineCount = Math.max(1, lines ?? 1);
  // Local live style during drag (re-renders only this overlay): the box follows the pointer, not hidden (per user), the iframe is edited directly by onLive.
  // ghost = line-width drag: the baseline solid line stays put, a dashed line follows, the iframe isn't touched, and on release a single rebuild applies the change
  const [liveStyle, setLiveStyle] = useState<CaptionStyle | null>(null);
  const [ghost, setGhost] = useState(false);
  // Drag shield: covers the whole stage during drag — if the pointer slides into the iframe region, events go to the iframe doc and the parent
  // window gets no move/up (setPointerCapture isn't reliable across this boundary), so the drag "disconnects"
  const [shield, setShield] = useState(false);
  const eff = liveStyle ?? style;
  const k = stageH / compH; // comp px → stage px
  const capPreset = getCaptionPreset(style.preset);
  const fontPx = capPreset.size;
  // Box geometry (positioning aligns to the render anchor: line center at xPct, bottom edge at yPct; box height measured, estimated when no measurement).
  // Baseline box = committed style, live box = style during drag: moving follows the solid line directly; widening uses ghost — the baseline solid line
  // stays put, a dashed line follows, and on release the solid line lands in one step (no "snap back to initial then jump", a feel the user called out).
  // Actual text height of a caption line (normalized to stage height): the lower bound of box height (hPct) — the box may be taller than the text (pure padding), not shorter.
  // Actual line height (analytic, same source as the render CSS: fs×1.2 line-height + surface top/bottom padding round(fs×0.22)×2).
  // Can't use the iframe-measured rect — it includes min-height (box height), which would inflate the "box can't be shorter than text" lower bound so the box can't shrink back
  const textHNorm = (s: CaptionStyle) => {
    const fsC = Math.max(10, Math.round(fontPx * s.scale));
    const padC = capPreset.bg ? Math.round(fsC * 0.22) * 2 : 0;
    // Multi-line stacks (cue blocks at large fonts): N lines, each with its own plate, plus the render's row-gap
    return (((fsC * 1.2 + padC) * lineCount + Math.round(fsC * 0.12) * (lineCount - 1)) * k) / stageH;
  };
  const rectOf = (s: CaptionStyle) => {
    const w = Math.max(60, ((s.wPct ?? 56) / 100) * stageW);
    const h = Math.max(16, Math.max(textHNorm(s), (s.hPct ?? 0) / 100) * stageH);
    return { left: (stageW * (s.xPct ?? 50)) / 100 - w / 2, top: (stageH * s.yPct) / 100 - h, w, h };
  };
  const baseR = rectOf(style);
  const liveR = rectOf(eff);
  const rootR = ghost ? baseR : liveR;
  const startRef = useRef(style);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  /** Zero setComp during drag: each frame updates local liveStyle (box follows); mode='live' (move) also sends onLive
   *  (hf:capStyle edits the iframe directly), mode='ghost' (resize) only moves the virtual box line — resizing needs reflow/re-segmentation,
   *  and per-frame direct edits can't keep up (user-reported performance), so a single rebuild applies on release. The overlay isn't unmounted, so capture stays valid. */
  const drag = (e: React.PointerEvent, apply: (s: CaptionStyle, dx: number, dy: number) => Partial<CaptionStyle>, mode: 'live' | 'ghost' = 'live') => {
    startRef.current = style;
    let patch: Partial<CaptionStyle> = {};
    startPointerDrag(e, {
      onStart: () => {
        if (mode === 'ghost') setGhost(true);
        setShield(true);
      },
      onFrame: (dx, dy) => {
        patch = apply(startRef.current, dx / stageW, dy / stageH);
        const merged = { ...startRef.current, ...patch };
        setLiveStyle(merged);
        if (mode === 'live') onLive(merged);
      },
      onEnd: () => {
        setLiveStyle(null);
        setGhost(false);
        setShield(false);
        if (Object.keys(patch).length) onChange(patch); // one commit on release (the rebuild swaps in the final form)
      },
    });
  };
  // Move: two axes; snaps and lights the center guide when horizontally near the canvas center axis (50%)
  const move = (s: CaptionStyle, dx: number, dy: number): Partial<CaptionStyle> => {
    let x = clamp((s.xPct ?? 50) + dx * 100, 10, 90);
    if (Math.abs(x - 50) < 1.5) x = 50;
    return { xPct: x, yPct: clamp(s.yPct + dy * 100, 15, 98) };
  };
  const snappedCenter = liveStyle != null && Math.abs((eff.xPct ?? 50) - 50) < 0.01;
  // Top/bottom mid-edge handles: adjust **box height** (pure padding, font size unchanged, per user). Top edge: the bottom edge (yPct)
  // is anchored, dragging up only expands padding; bottom edge: the top edge is anchored — the bottom edge is the caption anchor, the caption follows it and box height compensates. Lower bound = actual text height
  const edgeTop = (s: CaptionStyle, _dx: number, dy: number): Partial<CaptionStyle> => {
    const tH = textHNorm(s);
    const h0 = Math.max(tH, (s.hPct ?? 0) / 100);
    const h = clamp(h0 - dy, tH, Math.max(tH, s.yPct / 100));
    return { hPct: Math.round(h * 1000) / 10 };
  };
  const edgeBottom = (s: CaptionStyle, _dx: number, dy: number): Partial<CaptionStyle> => {
    const tH = textHNorm(s);
    const h0 = Math.max(tH, (s.hPct ?? 0) / 100);
    const yTop = s.yPct / 100 - h0;
    const y = clamp(s.yPct / 100 + dy, yTop + tH, 0.98);
    return { yPct: Math.round(y * 1000) / 10, hPct: Math.round((y - yTop) * 1000) / 10 };
  };
  // Left/right mid-edge handles: adjust **box width** (line-width terms, segmentation computed from box width) — only the dragged edge moves, opposite edge anchored; font size unchanged
  const edgeWidth = (sgn: 1 | -1) => (s: CaptionStyle, dx: number): Partial<CaptionStyle> => {
    const w0 = (s.wPct ?? 56) / 100;
    const x0 = (s.xPct ?? 50) / 100;
    let l = x0 - w0 / 2;
    let r = x0 + w0 / 2;
    if (sgn > 0) r = clamp(r + dx, l + 0.16, 0.98);
    else l = clamp(l + dx, 0.02, r - 0.16);
    return { wPct: Math.round((r - l) * 1000) / 10, xPct: clamp(((l + r) / 2) * 100, 10, 90) };
  };
  const knob = 'pointer-events-auto absolute rounded-full border-2 border-accent bg-white shadow';
  return (
    <div className="pointer-events-none absolute z-30" style={{ left: rootR.left, top: rootR.top, width: rootR.w, height: rootR.h }}>
      {/* Center-axis guide: lights up when the drag snaps to the canvas horizontal center (spans the whole stage) */}
      {snappedCenter && (
        <div className="bg-accent/90 absolute w-px" style={{ left: stageW / 2 - rootR.left, top: -rootR.top, height: stageH, boxShadow: '0 0 6px rgba(63,75,232,0.55)' }} />
      )}
      <div className="ring-accent/80 absolute inset-0 rounded-md ring-2" />
      {/* Widen ghost: the baseline solid line stays, the dashed line follows (solid line lands in one step on release) */}
      {ghost && (
        <div
          className="border-accent pointer-events-none absolute rounded-md border-2 border-dashed"
          style={{ left: liveR.left - baseR.left, top: liveR.top - baseR.top, width: liveR.w, height: liveR.h }}
        />
      )}
      {/* The whole box face is draggable = move (the caption-word editing surface is in the script panel, covering doesn't block any editing) */}
      <div className="pointer-events-auto absolute inset-0 cursor-move" onPointerDown={(e) => drag(e, move)} />
      {/* Left/right mid-edge handles = line width (re-segment, ghost: solid line stays, dashed follows, one rebuild on release);
          top/bottom mid-edge handles = box height (pure padding, font size unchanged, follows live directly); corners = line width + box height together (ghost). */}
      <div className={`${knob} top-1/2 -left-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('workbench.adjustLineWidth')} onPointerDown={(e) => drag(e, edgeWidth(-1), 'ghost')} />
      <div className={`${knob} top-1/2 -right-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('workbench.adjustLineWidth')} onPointerDown={(e) => drag(e, edgeWidth(1), 'ghost')} />
      <div className={`${knob} left-1/2 -top-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('workbench.adjustBoxHeight')} onPointerDown={(e) => drag(e, edgeTop)} />
      <div className={`${knob} left-1/2 -bottom-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('workbench.adjustBoxHeight')} onPointerDown={(e) => drag(e, edgeBottom)} />
      <div className={`${knob} -top-[7px] -left-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('workbench.resize')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(-1)(s, dx), ...edgeTop(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -top-[7px] -right-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('workbench.resize')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(1)(s, dx), ...edgeTop(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -bottom-[7px] -left-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('workbench.resize')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(-1)(s, dx), ...edgeBottom(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -bottom-[7px] -right-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('workbench.resize')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(1)(s, dx), ...edgeBottom(s, dx, dy) }), 'ghost')} />
      {/* Drag shield (rendered last = topmost): stage-sized, blocks the iframe from eating events */}
      {shield && (
        <div
          className="pointer-events-auto absolute"
          style={{ left: -rootR.left, top: -rootR.top, width: stageW, height: stageH, cursor: ghost ? 'ew-resize' : 'move' }}
        />
      )}
    </div>
  );
}
