'use client';

/**
 * Stage box-drag handlers for the selected block: edge stretch, corner scale, grip move, rotate.
 * All follow ghost semantics — a dashed box (setGhostRect, direct DOM) follows the pointer, content
 * never updates live, and one commit lands on release via the rebuild-free patch channel.
 * Extracted from hyperframes-workbench.tsx — bodies verbatim.
 */

import type { MutableRefObject, SetStateAction } from 'react';
import { type Block, type Composition, blockKind } from '@pireel/studio-engine/composition';
import { startPointerDrag } from './drag-shell';
import { shiftBox } from './comp-diff';

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
  setComp: (action: SetStateAction<Composition>) => void;
  postPreview: (msg: Record<string, unknown>) => void;
  setBlockRotation: (id: string, deg: number) => void;
}

export function useBoxDrag(deps: BoxDragDeps) {
  const {
    fit, compRef, genIdsRef, stageBoxRef, rotateOverlayRef, rotateLabelRef, dragCursorRef,
    setBodyDragging, setGhostRect, setGuideVis, setComp, postPreview, setBlockRotation,
  } = deps;
  /** Edge-handle stretch (same as caption line width, per user: change the box size on this axis, content reflows to fill,
   *  no crop, no locked ratio): the opposite edge is anchored; contentBox resets to = box (old crop semantics are dropped,
   *  legacy cropped blocks reset to full-fill on one drag). The process writes directly in the iframe via hf:boxSize (zero React re-render), one commit on release. */
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
        setGhostRect(g); // ghost follows the pointer, content doesn't update live (applied once on release via the rebuild-free channel)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
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
        setGhostRect(g); // ghost follows the pointer, content doesn't update live (applied once on release via the rebuild-free channel)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
      },
    });
  };

  /** Floating toolbar drag handle: parent-side ghost semantics (like edge/corner handles) — dashed box follows the pointer
   *  + center snap guides, content doesn't move live, one shiftBox commit on release (applied via the rebuild-free channel). */
  const gripDrag = (e: React.PointerEvent, gripBlockId: string) => {
    const blk = compRef.current.blocks.find((b) => b.id === gripBlockId);
    const box0 = blk?.box;
    if (!blk || !box0 || genIdsRef.current.has(blk.id)) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    let dxn = 0;
    let dyn = 0;
    startPointerDrag(e, {
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
        setGhostRect({ x: box0.x + dxn, y: box0.y + dyn, w: box0.w, h: box0.h });
      },
      onEnd: () => {
        setGuideVis(false, false);
        setGhostRect(null);
        if (dxn || dyn) setComp((cc) => ({ ...cc, blocks: cc.blocks.map((b) => (b.id === blk.id ? shiftBox(b, dxn, dyn) : b)) }));
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
  return { edgeDrag, scaleDrag, gripDrag, rotateDrag };
}
