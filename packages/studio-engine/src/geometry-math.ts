/**
 * Safe-zone geometry (pure functions, no IO/no deps, unit-testable).
 * Occupancy grid → union over the segment → top-K largest empty rects. All coords normalized [0..1], origin top-left.
 */

export const GRID_W = 18;
export const GRID_H = 32; // ~9:16

/** Normalized rect [0..1], origin top-left. */
export interface NRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FrameGeom {
  t: number;
  face: NRect | null;
  /** GRID_W×GRID_H occupancy (1 = person). */
  occ: Uint8Array;
}
export interface SafeZone {
  /** Largest placeable empty rects (largest first, normalized). */
  rects: NRect[];
  /** Face union over the segment (hard exclusion). */
  face: NRect | null;
  /** Subject occupancy bbox over the segment. */
  subject: NRect | null;
  /** Extra hard-exclusion zones (e.g. a reserved bottom caption band, already merged into occupancy and subtracted from the safe zone). For debug overlay. */
  text?: NRect[];
}

/** Safe zone for a time range = union of per-frame occupancy in the segment (avoid everywhere the subject ever appeared) → largest empty rects in the complement. */
export function safeZoneForRange(frames: FrameGeom[], start: number, end: number, blockRects: NRect[] = []): SafeZone {
  const inRange = frames.filter((f) => f.t >= start - 0.01 && f.t <= end + 0.01);
  // No frames sampled in the range (short segments can end up with 0 frames after downsampling long videos) → use the nearest-in-time frame;
  // don't fall back to a whole-video union, or every empty segment's geom becomes identical (that was the cause of all >90s segments being the same).
  let use = inRange;
  if (!use.length && frames.length) {
    const mid = (start + end) / 2;
    use = [frames.reduce((a, b) => (Math.abs(b.t - mid) < Math.abs(a.t - mid) ? b : a))];
  }

  const occ = new Uint8Array(GRID_W * GRID_H);
  for (const f of use) for (let i = 0; i < occ.length; i++) if (f.occ[i]) occ[i] = 1;

  let face: NRect | null = null;
  for (const f of use) if (f.face) face = face ? unionRect(face, f.face) : { ...f.face };

  const blocked = Uint8Array.from(occ);
  if (face) markRect(blocked, padRect(face, 0.04)); // face = hard exclusion, merged in with padding
  for (const r of blockRects) markRect(blocked, r); // caption/watermark bands burned into the source = hard exclusion, subtracted

  const subject = occBBox(occ);
  const rects = topKEmptyRects(blocked, 3);
  return { rects, face, subject, ...(blockRects.length ? { text: blockRects } : {}) };
}

function topKEmptyRects(blocked: Uint8Array, k: number): NRect[] {
  const work = Uint8Array.from(blocked);
  const rects: NRect[] = [];
  for (let i = 0; i < k; i++) {
    const r = largestEmptyRect(work);
    if (!r || r.w * r.h < 8) break; // too small to count (<8 cells)
    rects.push({ x: r.x / GRID_W, y: r.y / GRID_H, w: r.w / GRID_W, h: r.h / GRID_H });
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) work[y * GRID_W + x] = 1;
  }
  return rects;
}

/** Largest all-empty rect on the grid (histogram method, O(W·H)). */
export function largestEmptyRect(blocked: Uint8Array): { x: number; y: number; w: number; h: number } | null {
  const heights = new Array<number>(GRID_W).fill(0);
  let best: { x: number; y: number; w: number; h: number } | null = null;
  let bestArea = 0;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) heights[c] = blocked[r * GRID_W + c] ? 0 : heights[c]! + 1;
    const stack: number[] = [];
    for (let c = 0; c <= GRID_W; c++) {
      const h = c < GRID_W ? heights[c]! : 0;
      while (stack.length && heights[stack[stack.length - 1]!]! >= h) {
        const ph = heights[stack.pop()!]!;
        const left = stack.length ? stack[stack.length - 1]! + 1 : 0;
        const w = c - left;
        if (ph * w > bestArea) {
          bestArea = ph * w;
          best = { x: left, y: r - ph + 1, w, h: ph };
        }
      }
      stack.push(c);
    }
  }
  return best;
}

function unionRect(a: NRect, b: NRect): NRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
function padRect(r: NRect, pad: number): NRect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}
function markRect(occ: Uint8Array, r: NRect): void {
  const x0 = Math.max(0, Math.floor(r.x * GRID_W));
  const y0 = Math.max(0, Math.floor(r.y * GRID_H));
  const x1 = Math.min(GRID_W, Math.ceil((r.x + r.w) * GRID_W));
  const y1 = Math.min(GRID_H, Math.ceil((r.y + r.h) * GRID_H));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) occ[y * GRID_W + x] = 1;
}
function occBBox(occ: Uint8Array): NRect | null {
  let minx = GRID_W;
  let miny = GRID_H;
  let maxx = -1;
  let maxy = -1;
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++)
      if (occ[y * GRID_W + x]) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
  if (maxx < 0) return null;
  return { x: minx / GRID_W, y: miny / GRID_H, w: (maxx - minx + 1) / GRID_W, h: (maxy - miny + 1) / GRID_H };
}
