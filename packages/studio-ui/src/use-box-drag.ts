'use client';

/**
 * Stage box-drag handlers for the selected block: edge stretch, corner scale, grip move, rotate.
 * Every gesture previews geometry directly inside the iframe while the solid selection shell follows
 * the pointer. React/document state still commits only once on release via the rebuild-free patch channel.
 * Extracted from hyperframes-workbench.tsx — bodies verbatim.
 */

import type { MutableRefObject } from 'react';
import { type Block, type Composition, type EditorDocumentV2, applyOverlayDocumentEdits, blockKind } from '@pireel/studio-engine/composition';
import { toast } from '@pireel/ui/toast';
import { startPointerDrag } from './drag-shell';
import { shiftBox } from './comp-diff';
import { boxSelectionRect } from './edit-overlays';
import { moveMediaCanvasBox, resizeMediaCanvasBox, scaleMediaCanvasBox, type MediaCanvasBox } from './media-box';

export interface CanvasBoxDragTarget {
  box: MediaCanvasBox;
  onLive: (box: MediaCanvasBox) => void;
  onCommit: (box: MediaCanvasBox) => void;
  onPick?: (x: number, y: number) => void;
}

export interface BoxDragDeps {
  /** Canvas→stage uniform scale (comp px → stage px). */
  fit: number;
  compRef: MutableRefObject<Composition>;
  genIdsRef: MutableRefObject<ReadonlySet<string>>;
  stageBoxRef: MutableRefObject<HTMLDivElement | null>;
  rotateOverlayRef: MutableRefObject<HTMLDivElement | null>;
  rotateLabelRef: MutableRefObject<HTMLSpanElement | null>;
  dragCursorRef: MutableRefObject<string>;
  setBodyDragging: (v: boolean) => void;
  setGhostRect: (g: { x: number; y: number; w: number; h: number } | null) => void;
  setGuideVis: (cx: boolean, cy: boolean) => void;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2) => void;
  postPreview: (msg: Record<string, unknown>) => void;
  setBlockRotation: (id: string, deg: number) => void;
}

export function useBoxDrag(deps: BoxDragDeps) {
  const {
    fit, compRef, genIdsRef, stageBoxRef, rotateOverlayRef, rotateLabelRef, dragCursorRef,
    setBodyDragging, setGhostRect, setGuideVis, documentRef, setDocument, postPreview, setBlockRotation,
  } = deps;
  const patchBlock = (clipId: string, block: Partial<Omit<Block, 'id' | 'startSec' | 'durationSec' | 'trackIndex'>>) => {
    const edit = applyOverlayDocumentEdits({ document: documentRef.current, updates: [{ clipId, block }] });
    if (!edit.ok) {
      toast.error(edit.error.message);
      return;
    }
    setDocument(edit.document);
  };
  /** Keep the one solid selection shell on the same live geometry as the iframe content.
   *  React still commits only on pointer-up; these four DOM writes avoid a second, stale baseline box. */
  const previewSelectionRect = (box: { x: number; y: number; w: number; h: number }, outset?: number) => {
    const overlay = rotateOverlayRef.current;
    const stage = stageBoxRef.current?.getBoundingClientRect();
    if (!overlay || !stage) return;
    const rect = boxSelectionRect(box, stage.width, stage.height, outset);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };
  /** Edge-handle stretch (same as caption line width, per user: change the box size on this axis, content reflows to fill,
   *  no crop, no locked ratio): the opposite edge is anchored; contentBox resets to = box (old crop semantics are dropped,
   *  legacy cropped blocks reset to full-fill on one drag). The process writes directly to the iframe and solid selection shell
   *  (zero React re-render), then commits once on release. */
  const edgeDrag = (e: React.PointerEvent, blk: Block, side: 'l' | 'r' | 't' | 'b') => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = side === 'l' || side === 'r' ? 'ew-resize' : 'ns-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (side === 'r') g.w = Math.max(0.04, box0.w + dx);
        else if (side === 'l') {
          g.w = Math.max(0.04, box0.w - dx);
          g.x = box0.x + box0.w - g.w;
        } else if (side === 'b') g.h = Math.max(0.03, box0.h + dy);
        else {
          g.h = Math.max(0.03, box0.h - dy);
          g.y = box0.y + box0.h - g.h;
        }
        previewSelectionRect(g);
        postPreview({ type: 'hf:boxSize', blockId: blk.id, ...g, cx: 0, cy: 0, cw: 1, ch: 1, s: 1 });
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        patchBlock(blk.id, { box: gg, contentBox: undefined });
      },
    });
  };
  /** Corner-handle scale: the diagonal corner is anchored, the process writes directly in the iframe via hf:boxSize (zero React re-render), one commit on release.
   *  - custom (component) blocks: **box locks aspect ratio** (per user: corners = inner container keeps its ratio). Content
   *    isn't transform-scaled — the inner container's real size follows the box via the %-binding from insert, and font size adjusts automatically with the container via cq units;
   *  - others (media, etc.): free scaling, no locked ratio, content reflows to fill (original behavior). */
  const scaleDrag = (e: React.PointerEvent, blk: Block, sgnX: 1 | -1, sgnY: 1 | -1) => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    const uniform = blockKind(blk) === 'custom';
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = sgnX * sgnY > 0 ? 'nwse-resize' : 'nesw-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (uniform) {
          // Horizontal-driven proportional scale: k = new width/old width, height follows ×k (diagonal anchored)
          const w = Math.max(0.04, sgnX > 0 ? box0.w + dx : box0.w - dx);
          const k = w / box0.w;
          g.w = w;
          g.h = Math.max(0.03, box0.h * k);
          if (sgnX < 0) g.x = box0.x + box0.w - g.w;
          if (sgnY < 0) g.y = box0.y + box0.h - g.h;
        } else {
          if (sgnX > 0) g.w = Math.max(0.04, box0.w + dx);
          else {
            g.w = Math.max(0.04, box0.w - dx);
            g.x = box0.x + box0.w - g.w;
          }
          if (sgnY > 0) g.h = Math.max(0.03, box0.h + dy);
          else {
            g.h = Math.max(0.03, box0.h - dy);
            g.y = box0.y + box0.h - g.h;
          }
        }
        previewSelectionRect(g);
        postPreview({ type: 'hf:boxSize', blockId: blk.id, ...g, cx: 0, cy: 0, cw: 1, ch: 1, s: 1 });
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        patchBlock(blk.id, { box: gg, contentBox: undefined });
      },
    });
  };

  /** Floating toolbar drag handle: dashed box + component content follow the pointer with center snap guides;
   *  the canonical box still receives one shiftBox commit on release. */
  const gripDrag = (e: React.PointerEvent, gripBlockId: string) => {
    const blk = compRef.current.blocks.find((b) => b.id === gripBlockId);
    const box0 = blk?.box;
    if (!blk || !box0 || genIdsRef.current.has(blk.id)) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    let dxn = 0;
    let dyn = 0;
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = '';
        setBodyDragging(true);
      },
      onFrame: (dx, dy) => {
        dxn = dx / sr.width;
        dyn = dy / sr.height;
        // Center snap (same as body drag: the block center snaps to the canvas midline within 1.5%)
        const cx = box0.x + box0.w / 2 + dxn;
        const cy = box0.y + box0.h / 2 + dyn;
        const snapX = Math.abs(cx - 0.5) < 0.015;
        const snapY = Math.abs(cy - 0.5) < 0.015;
        if (snapX) dxn = 0.5 - (box0.x + box0.w / 2);
        if (snapY) dyn = 0.5 - (box0.y + box0.h / 2);
        setGuideVis(snapX, snapY);
        const moved = { x: box0.x + dxn, y: box0.y + dyn, w: box0.w, h: box0.h };
        previewSelectionRect(moved);
        postPreview({ type: 'hf:boxSize', blockId: blk.id, ...moved });
      },
      onEnd: () => {
        setBodyDragging(false);
        setGuideVis(false, false);
        setGhostRect(null);
        if (dxn || dyn) patchBlock(blk.id, { box: shiftBox(blk, dxn, dyn).box });
      },
    });
  };

  /** The same stage shell used by components, adapted to any persisted canvas box. */
  const canvasGripDrag = (e: React.PointerEvent, target: CanvasBoxDragTarget) => {
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    const box0 = target.box;
    const pick = { x: (e.clientX - sr.left) / sr.width, y: (e.clientY - sr.top) / sr.height };
    let next = box0;
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = '';
        setBodyDragging(true);
      },
      onFrame: (dx, dy) => {
        next = moveMediaCanvasBox(box0, dx / sr.width, dy / sr.height, 8 / sr.width, 8 / sr.height);
        const snapX = Math.abs(next.x + next.w / 2 - 0.5) < 1e-5;
        const snapY = Math.abs(next.y + next.h / 2 - 0.5) < 1e-5;
        setGuideVis(snapX, snapY);
        previewSelectionRect(next, 0);
        target.onLive(next);
      },
      onEnd: () => {
        setBodyDragging(false);
        setGuideVis(false, false);
        setGhostRect(null);
        if (next.x !== box0.x || next.y !== box0.y) target.onCommit(next);
        else target.onPick?.(pick.x, pick.y);
      },
    });
  };

  /** Proportional corner resize for native media, using the shared pointer/shield/selection-shell path. */
  const canvasScaleDrag = (e: React.PointerEvent, target: CanvasBoxDragTarget, sgnX: 1 | -1, sgnY: 1 | -1) => {
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    const box0 = target.box;
    let next = box0;
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = sgnX * sgnY > 0 ? 'nwse-resize' : 'nesw-resize';
        setBodyDragging(true);
      },
      onFrame: (dx, dy) => {
        next = scaleMediaCanvasBox(
          box0,
          dx / sr.width,
          dy / sr.height,
          sgnX,
          sgnY,
          Math.min(1, 48 / sr.width),
          Math.min(1, 48 / sr.height),
        );
        previewSelectionRect(next, 0);
        target.onLive(next);
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        if (next.w !== box0.w || next.h !== box0.h) target.onCommit(next);
      },
    });
  };
  /** Independent side resize for native media. The opposite edge remains anchored and the iframe
   *  receives the same live box stream as move/corner scale, so no React render sits on the gesture path. */
  const canvasEdgeDrag = (e: React.PointerEvent, target: CanvasBoxDragTarget, side: 'l' | 'r' | 't' | 'b') => {
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    const box0 = target.box;
    let next = box0;
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = side === 'l' || side === 'r' ? 'ew-resize' : 'ns-resize';
        setBodyDragging(true);
      },
      onFrame: (dx, dy) => {
        const horizontal = side === 'l' || side === 'r';
        next = resizeMediaCanvasBox(
          box0,
          horizontal ? dx / sr.width : dy / sr.height,
          side,
          Math.min(1, 48 / sr.width),
          Math.min(1, 48 / sr.height),
        );
        previewSelectionRect(next, 0);
        target.onLive(next);
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        if (next.x !== box0.x || next.y !== box0.y || next.w !== box0.w || next.h !== box0.h) target.onCommit(next);
      },
    });
  };
  /** Bottom rotate handle: rotate around the component center by the pointer angle, live via hf:rotate directly in the iframe (zero re-render), commits to Block.rotation on release.
   *  Shift = 15° snap. */
  const rotateDrag = (e: React.PointerEvent, block: Block) => {
    const box = block.box;
    const stage = stageBoxRef.current;
    if (!box || !stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + (box.x + box.w / 2) * rect.width;
    const cy = rect.top + (box.y + box.h / 2) * rect.height;
    const base = block.rotation ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    let deg = base;
    startPointerDrag(e, {
      onStart: () => {
        if (rotateLabelRef.current) rotateLabelRef.current.style.display = 'block'; // show the angle as soon as dragging starts (even from 0°)
      },
      onFrame: (_dx, _dy, ev) => {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        let d = base + ((a - a0) * 180) / Math.PI;
        if (ev.shiftKey) d = Math.round(d / 15) * 15;
        d = Math.round(d);
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        deg = d;
        postPreview({ type: 'hf:rotate', blockId: block.id, deg }); // the card in the iframe rotates live
        if (rotateOverlayRef.current) rotateOverlayRef.current.style.transform = deg ? `rotate(${deg}deg)` : ''; // selection box/handles rotate with it
        if (rotateLabelRef.current) {
          rotateLabelRef.current.textContent = `${deg}°`;
          rotateLabelRef.current.style.transform = deg ? `rotate(${-deg}deg)` : ''; // counter-rotate to keep the number upright
        }
      },
      onEnd: () => setBlockRotation(block.id, deg),
    });
  };
  return { edgeDrag, scaleDrag, gripDrag, rotateDrag, canvasGripDrag, canvasScaleDrag, canvasEdgeDrag };
}
