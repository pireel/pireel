/**
 * Transport-independent placement contract for generated overlay Components.
 *
 * Agents describe intent in canvas percentages. The editor converts that intent once, before
 * generation, and every execution surface reuses the same normalized box for prompt context and
 * timeline insertion. This prevents the internal chat, browser MCP bridge and offline MCP runner
 * from generating for one shape and committing into another.
 */

export interface EditableBlockBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacementPercentInput {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

/** Initial overlay landing area. Portrait social video reserves extra room for platform chrome and
 * captions; landscape and square canvases use a lighter inset. Users can still move elements out of
 * this area manually after insertion. */
export function editableOverlaySafeArea(canvasW: number, canvasH: number): EditableBlockBox {
  const portraitSocial = Number.isFinite(canvasW) && Number.isFinite(canvasH) && canvasW > 0 && canvasH / canvasW >= 1.45;
  return portraitSocial
    ? { x: 0.07, y: 0.11, w: 0.86, h: 0.7 }
    : { x: 0.05, y: 0.07, w: 0.9, h: 0.86 };
}

/** Scale down and clamp an automatically placed overlay into the delivery-safe landing area.
 * Intentional full-canvas layers remain full bleed. */
export function fitEditableBoxIntoSafeArea(
  box: EditableBlockBox,
  canvasW: number,
  canvasH: number,
): EditableBlockBox {
  if (box.x <= 0.001 && box.y <= 0.001 && box.w >= 0.999 && box.h >= 0.999) return box;
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return box;
  const safe = editableOverlaySafeArea(canvasW, canvasH);
  const scale = Math.min(1, safe.w / box.w, safe.h / box.h);
  const w = box.w * scale;
  const h = box.h * scale;
  const x = Math.max(safe.x, Math.min(safe.x + safe.w - w, box.x));
  const y = Math.max(safe.y, Math.min(safe.y + safe.h - h, box.y));
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

export function placementPercentToBox(
  value: unknown,
  canvasW: number,
  canvasH: number,
): { box?: EditableBlockBox; error?: string } {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'placement must be an object with xPct, yPct, widthPct and heightPct' };
  }
  const raw = value as Record<string, unknown>;
  const xPct = Number(raw.xPct);
  const yPct = Number(raw.yPct);
  const widthPct = Number(raw.widthPct);
  const heightPct = Number(raw.heightPct);
  if (![xPct, yPct, widthPct, heightPct].every(Number.isFinite)) {
    return { error: 'placement must contain finite xPct, yPct, widthPct and heightPct values' };
  }
  const w = Math.min(1, Math.max(0.04, widthPct / 100));
  const h = Math.min(1, Math.max(0.03, heightPct / 100));
  return {
    box: fitEditableBoxIntoSafeArea({
      x: Math.min(1 - w, Math.max(0, xPct / 100)),
      y: Math.min(1 - h, Math.max(0, yPct / 100)),
      w,
      h,
    }, canvasW, canvasH),
  };
}

export function boxToPlacementPercent(box: EditableBlockBox): PlacementPercentInput {
  const pct = (value: number) => Math.round(value * 10000) / 100;
  return { xPct: pct(box.x), yPct: pct(box.y), widthPct: pct(box.w), heightPct: pct(box.h) };
}
