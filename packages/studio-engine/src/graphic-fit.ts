/**
 * Program-side fitting of a placed graphic to the picture, before anyone has to regenerate it.
 *
 * The browser renders the graphic exactly as export does and measures it (what is painted, what is
 * ink, the smallest text); the speaker's head and the caption band are the obstacles. This module
 * decides the smallest change that makes it right — enlarge text that is too small to read, move the
 * graphic off the face or the captions, widen a box its content spills out of, and as a last resort
 * shrink it a little to make room — and expresses it in the block's own geometry:
 *
 *   box         the window (what is shown; content outside it is clipped),
 *   contentBox  the layout the piece builds itself in (its size never changes here: no reflow),
 *   scale       the uniform visual scale of that layout around its centre.
 *
 * Every change is a similarity transform of what is already drawn (scale g around an anchor, then a
 * translation), so the result looks exactly like the measured graphic, only bigger, smaller or
 * elsewhere.
 */

import type { NormBox } from './composition-core';

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphicMeasure {
  /** Marks that must stay readable and off the face: text, solid fills, images. Canvas px. */
  ink: PxRect | null;
  /** Everything painted, translucent fills and gradients included: what the window must hold. */
  paint: PxRect | null;
  /** Smallest rendered text, canvas px (null = no text). */
  minFontPx: number | null;
  /** Largest rendered text, canvas px: enlarging stops before headlines turn oversized. */
  maxFontPx?: number | null;
}

export interface GraphicGeometry {
  box: NormBox;
  contentBox?: NormBox;
  scale?: number;
  fitScale?: number;
}

/** speaker = a shrunk or split speaker's window: the whole picture of them, not only their face. */
export type GraphicObstacleKind = 'face' | 'speaker' | 'captions' | 'graphic';

/** Where a shot's picture lands on the canvas, normalized: its crop window scaled around the
 *  canvas centre, then offset (the order the preview and export apply them in). */
export function mediaWindowBox(framing: { transform: { scale: number; offsetX: number; offsetY: number }; crop: { top: number; right: number; bottom: number; left: number } }): NormBox {
  const { scale, offsetX, offsetY } = framing.transform;
  const at = (u: number, offset: number) => 0.5 + (u - 0.5) * scale + offset;
  const x0 = at(framing.crop.left, offsetX);
  const y0 = at(framing.crop.top, offsetY);
  return { x: x0, y: y0, w: at(1 - framing.crop.right, offsetX) - x0, h: at(1 - framing.crop.bottom, offsetY) - y0 };
}

export interface GraphicObstacle extends PxRect {
  kind: GraphicObstacleKind;
}

export interface GraphicFitInput {
  canvas: { width: number; height: number };
  geometry: GraphicGeometry;
  measure: GraphicMeasure;
  obstacles: readonly GraphicObstacle[];
  /** False to leave the size alone (a second pass after a resize must not compound it). */
  grow?: boolean;
}

export interface GraphicFitResult {
  /** The new geometry, or null when the graphic is already fine. */
  geometry: { box: NormBox; contentBox: NormBox; scale: number } | null;
  /** What was changed, for the model's receipt. */
  changes: string[];
  /** What could not be fixed by moving and scaling. */
  unresolved: string[];
}

/** Text smaller than this (canvas px) is hard to read on a phone: 2.6% of the short side (28px at 1080). */
export function minReadableGraphicFontPx(canvas: { width: number; height: number }): number {
  return Math.round(0.026 * Math.min(canvas.width, canvas.height));
}

/** Enlarging a graphic stops before its largest text passes this: 10% of the short side. */
const maxGrownFontPx = (canvas: { width: number; height: number }) => Math.round(0.1 * Math.min(canvas.width, canvas.height));

const MAX_GROW = 1.6;
const MIN_SHRINK = 0.75;

/** What a graphic must not cover around a detected face box: the forehead above it and a little
 *  room at the sides and chin. Hair or a hat above that may sit under a graphic. */
export function headRectFromFace(face: PxRect): PxRect {
  return { x: face.x - face.w * 0.1, y: face.y - face.h * 0.3, w: face.w * 1.2, h: face.h * 1.4 };
}

export function unionRects(rects: readonly (PxRect | null | undefined)[]): PxRect | null {
  let out: PxRect | null = null;
  for (const rect of rects) {
    if (!rect || !(rect.w > 0) || !(rect.h > 0)) continue;
    if (!out) { out = { ...rect }; continue; }
    const x = Math.min(out.x, rect.x);
    const y = Math.min(out.y, rect.y);
    out = { x, y, w: Math.max(out.x + out.w, rect.x + rect.w) - x, h: Math.max(out.y + out.h, rect.y + rect.h) - y };
  }
  return out;
}

const intersects = (a: PxRect, b: PxRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inflate = (r: PxRect, by: number): PxRect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });
const shift = (r: PxRect, dx: number, dy: number): PxRect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
const scaleAbout = (r: PxRect, ax: number, ay: number, g: number): PxRect => ({ x: ax + (r.x - ax) * g, y: ay + (r.y - ay) * g, w: r.w * g, h: r.h * g });
const toPx = (b: NormBox, W: number, H: number): PxRect => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const toNorm = (r: PxRect, W: number, H: number): NormBox => ({ x: round4(r.x / W), y: round4(r.y / H), w: round4(r.w / W), h: round4(r.h / H) });
const clipTo = (r: PxRect, W: number, H: number): PxRect => {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, w: Math.max(1, Math.min(W, r.x + r.w) - x), h: Math.max(1, Math.min(H, r.y + r.h) - y) };
};

/** Where a resize keeps the graphic pinned: its top edge, and the side it hugs (centre when centred). */
function anchorOf(r: PxRect, W: number): { x: number; y: number } {
  const cx = r.x + r.w / 2;
  if (Math.abs(cx - W / 2) < W * 0.06) return { x: cx, y: r.y };
  return { x: cx < W / 2 ? r.x : r.x + r.w, y: r.y };
}

/** Shift needed to bring `r` inside `area` on one axis (0 when it already fits; centres it when it cannot). */
function axisClamp(start: number, size: number, areaStart: number, areaSize: number): number {
  if (size > areaSize) return areaStart + (areaSize - size) / 2 - start;
  if (start < areaStart) return areaStart - start;
  if (start + size > areaStart + areaSize) return areaStart + areaSize - (start + size);
  return 0;
}

interface Placement { g: number; dx: number; dy: number; crossed?: boolean }

export function fitGraphic(input: GraphicFitInput): GraphicFitResult {
  const { width: W, height: H } = input.canvas;
  const { measure, geometry } = input;
  const paint = measure.paint ?? measure.ink;
  if (!paint) return { geometry: null, changes: [], unresolved: [] };
  const ink = measure.ink;
  const subject0 = ink ?? paint;
  const fullBleed = paint.w >= W * 0.97;
  const floor = minReadableGraphicFontPx(input.canvas);
  // The whole graphic scales, so its headline grows with its smallest label: cap it there.
  const headroom = measure.maxFontPx ? Math.max(1, maxGrownFontPx(input.canvas) / measure.maxFontPx) : MAX_GROW;
  const gWant = input.grow !== false && measure.minFontPx && measure.minFontPx < floor - 0.5 ? Math.min(MAX_GROW, headroom, floor / measure.minFontPx) : 1;
  const anchor = anchorOf(subject0, W);
  const margin = Math.round(H * 0.012);
  const safe: PxRect = { x: W * 0.03, y: H * 0.03, w: W * 0.94, h: H * 0.94 };
  // Ink stays off the obstacles; a background wash (no ink) may sit anywhere.
  const obstacles = ink ? input.obstacles.map((o) => ({ ...inflate(o, margin), kind: o.kind })) : [];
  const tolerance = 1.5;

  const valid = (inkRect: PxRect, paintRect: PxRect): boolean => {
    if (!fullBleed && (paintRect.x < -tolerance || paintRect.x + paintRect.w > W + tolerance)) return false;
    if (paintRect.y < -tolerance || paintRect.y + paintRect.h > H + tolerance) return false;
    if (ink && (inkRect.x < safe.x - tolerance || inkRect.x + inkRect.w > safe.x + safe.w + tolerance
      || inkRect.y < safe.y - tolerance || inkRect.y + inkRect.h > safe.y + safe.h + tolerance)) return false;
    return !obstacles.some((o) => intersects(inkRect, o));
  };

  const placeAt = (g: number): (Placement & { cost: number }) | null => {
    const subject = scaleAbout(subject0, anchor.x, anchor.y, g);
    const painted = scaleAbout(paint, anchor.x, anchor.y, g);
    const dxs = new Set([0]);
    const dys = new Set([0]);
    for (const o of obstacles) {
      if (!intersects(subject, o)) continue;
      dys.add(o.y - (subject.y + subject.h));
      dys.add(o.y + o.h - subject.y);
      dxs.add(o.x - (subject.x + subject.w));
      dxs.add(o.x + o.w - subject.x);
    }
    let best: (Placement & { cost: number }) | null = null;
    let bestCost = Infinity;
    for (const dx0 of dxs) {
      for (const dy0 of dys) {
        // Then pull it inside the frame (ink inside the safe area, paint inside the canvas).
        let dx = dx0 + (ink ? axisClamp(subject.x + dx0, subject.w, safe.x, safe.w) : 0);
        let dy = dy0 + (ink ? axisClamp(subject.y + dy0, subject.h, safe.y, safe.h) : 0);
        if (!fullBleed) dx += axisClamp(painted.x + dx, painted.w, 0, W);
        dy += axisClamp(painted.y + dy, painted.h, 0, H);
        if (!valid(shift(subject, dx, dy), shift(painted, dx, dy))) continue;
        // Moving sideways reads as a different layout; up or down keeps it. Jumping to the other
        // side of the speaker's face (over the head to the chest, say) changes the layout most and
        // lands on what they hold, so a smaller copy on the same side usually wins.
        const crossed = input.obstacles.filter((o) => o.kind === 'face').some((o) => {
          const before = Math.sign(subject.y + subject.h / 2 - (o.y + o.h / 2));
          const after = Math.sign(subject.y + dy + subject.h / 2 - (o.y + o.h / 2));
          return before !== 0 && after !== before;
        });
        const cost = Math.abs(dx) * 1.5 + Math.abs(dy) + (crossed ? H * 0.35 : 0);
        if (cost < bestCost) { bestCost = cost; best = { g, dx, dy, cost, crossed }; }
      }
    }
    return best;
  };

  const tries: number[] = [];
  for (let g = gWant; g > 1.0001; g /= 1.08) tries.push(g);
  tries.push(1);
  for (let g = 1 / 1.08; g >= MIN_SHRINK - 1e-6; g /= 1.08) tries.push(g);
  // Every size is weighed against the move it needs: shrinking 10% costs about as much as moving
  // 15% of the height; staying a step short of readable text costs a third of that, so a graphic
  // keeps its place rather than travel across the frame just to grow.
  let placement: Placement | null = null;
  let placementCost = Infinity;
  for (const g of tries) {
    const found = placeAt(g);
    if (!found) continue;
    const cost = found.cost + Math.max(0, 1 - g) * H * 1.5 + Math.max(0, gWant - Math.max(1, g)) * H * 0.5;
    if (cost < placementCost) { placementCost = cost; placement = found; }
  }
  const unresolved: string[] = [];
  if (!placement) {
    // Nothing clears every obstacle: keep the size, stay inside the frame, and say what is left.
    const kinds = [...new Set(input.obstacles.filter((o) => ink && intersects(ink, inflate(o, margin))).map((o) => o.kind))];
    placement = { g: 1, dx: ink ? axisClamp(ink.x, ink.w, safe.x, safe.w) : 0, dy: ink ? axisClamp(ink.y, ink.h, safe.y, safe.h) : 0 };
    if (kinds.length) unresolved.push(`still covers the ${kinds.join(' and ')}: no free area fits it, even ${Math.round(MIN_SHRINK * 100)}% size; move or shorten it`);
  }
  const { g, dx, dy } = placement;
  const transform = (r: PxRect) => shift(scaleAbout(r, anchor.x, anchor.y, g), dx, dy);

  const window0 = toPx(geometry.box, W, H);
  const layout0 = toPx(geometry.contentBox ?? geometry.box, W, H);
  const s0 = (geometry.scale ?? 1) * (geometry.fitScale && geometry.fitScale < 0.999 ? geometry.fitScale : 1);
  // The layout as drawn (its scale applies around its centre).
  const drawnLayout = scaleAbout(layout0, layout0.x + layout0.w / 2, layout0.y + layout0.h / 2, s0);
  // Glyph boxes run a few px past a tight line box; only a real spill counts.
  const slack = Math.max(6, Math.round(Math.min(W, H) * 0.006));
  const outside = (r: PxRect) => paint.x < r.x - slack || paint.y < r.y - slack || paint.x + paint.w > r.x + r.w + slack || paint.y + paint.h > r.y + r.h + slack;
  // Content past the window is clipped; content past the layout makes the preview shrink it to fit.
  // Both grow to hold what the piece draws.
  const spilled = outside(window0) || outside(drawnLayout);
  const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
  const scaled = Math.abs(g - 1) > 0.005;
  // What scaling cannot fix (no room, or the headline would oversize) goes back to the piece's css.
  const tooSmall = (g: number) => measure.minFontPx && measure.minFontPx * g < floor - 0.5
    ? `smallest text is ${Math.round(measure.minFontPx * g)}px (under ${floor}px): raise that text's size in the piece css`
    : '';
  if (!moved && !scaled && !spilled) {
    const small = tooSmall(1);
    if (small) unresolved.unshift(small);
    return { geometry: null, changes: [], unresolved };
  }

  const s1 = s0 * g;
  const drawn = transform(outside(drawnLayout) ? unionRects([drawnLayout, paint])! : drawnLayout);
  const contentBox: PxRect = { x: drawn.x + drawn.w / 2 - drawn.w / s1 / 2, y: drawn.y + drawn.h / 2 - drawn.h / s1 / 2, w: drawn.w / s1, h: drawn.h / s1 };
  const box = clipTo(unionRects([transform(window0), transform(paint)])!, W, H);

  const changes: string[] = [];
  if (scaled && g > 1) changes.push(`text was ${Math.round(measure.minFontPx!)}px (under ${floor}px): enlarged ×${g.toFixed(2)}`);
  if (scaled && g < 1) changes.push(`shrunk to ${Math.round(g * 100)}% to fit a free area`);
  if (moved) {
    const cleared = [...new Set(input.obstacles.filter((o) => ink && intersects(scaleAbout(ink, anchor.x, anchor.y, g), inflate(o, margin))).map((o) => o.kind))];
    const parts = [
      Math.abs(dy) >= H * 0.005 ? `${dy < 0 ? 'up' : 'down'} ${Math.round((Math.abs(dy) / H) * 1000) / 10}% of the height` : '',
      Math.abs(dx) >= W * 0.005 ? `${dx < 0 ? 'left' : 'right'} ${Math.round((Math.abs(dx) / W) * 1000) / 10}% of the width` : '',
    ].filter(Boolean).join(' and ');
    if (parts) changes.push(`moved ${parts}${cleared.length ? ` to clear the ${cleared.join(' and ')}` : ' to stay inside the frame'}`);
  }
  if (spilled) changes.push('its content spilled outside its box and was clipped: the box now holds all of it');
  const small = tooSmall(g);
  if (small) unresolved.unshift(small);
  if (placement.crossed) unresolved.push('it only fits on the other side of the face now: check its still, and if it covers what the speaker shows, shorten it or place it elsewhere');
  return {
    geometry: { box: toNorm(box, W, H), contentBox: toNorm(contentBox, W, H), scale: Math.round(s1 * 1000) / 1000 },
    changes,
    unresolved,
  };
}
