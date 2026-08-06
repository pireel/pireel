/** Normalized canvas rectangle used by visual-analysis placement helpers. */
export type Box = { x: number; y: number; w: number; h: number };

/** Default overlay area: clear of frame edges and the caption reserve at the bottom. */
const DEFAULT_GRAPHIC_BOX: Box = { x: 0.07, y: 0.46, w: 0.86, h: 0.38 };

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pick the first sufficiently large safe rectangle, inset it from edges, and avoid faces. */
export function pickGraphicBox(rects: Box[], faces: Box[], fallback: Box = DEFAULT_GRAPHIC_BOX): Box {
  const margin = 0.03;
  for (const rect of rects) {
    const x = rect.x + margin;
    const y = rect.y + margin;
    const w = rect.w - margin * 2;
    const h = Math.min(rect.h - margin * 2, 0.84 - y);
    if (w < 0.42 || h < 0.2) continue;
    const box = { x, y, w, h };
    if (!faces.some((face) => intersects(box, face))) return box;
  }
  return fallback;
}
