export interface MediaCanvasBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned framing currently applied to a native media layer. The values mirror the
 * compositor's transform/clip output, but stay renderer-agnostic so editor chrome can use the
 * exact same geometry without reaching into the preview iframe. */
export interface MediaFramingGeometry {
  scale: number;
  xPercent: number;
  yPercent: number;
  inset: { t: number; r: number; b: number; l: number };
}

const clean = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
};
const snap = (value: number, targets: readonly number[], threshold: number) => {
  if (!(threshold > 0)) return value;
  const target = targets.find((candidate) => Math.abs(candidate - value) <= threshold);
  return target ?? value;
};

export const FULL_MEDIA_CANVAS_BOX: MediaCanvasBox = { x: 0, y: 0, w: 1, h: 1 };

/** Source pixels visible inside a full-canvas placement before any user transform. */
export function fittedMediaContentBox(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  canvasWidth: number,
  canvasHeight: number,
  fit: 'contain' | 'cover',
): MediaCanvasBox {
  if (fit === 'cover' || !sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return FULL_MEDIA_CANVAS_BOX;
  }
  const relativeAspect = (sourceWidth / sourceHeight) / (canvasWidth / canvasHeight);
  if (relativeAspect >= 1) {
    const h = 1 / relativeAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = relativeAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/** Map the persisted full-canvas layer placement to the border around its visible source pixels. */
export function mediaContentBox(
  placement: MediaCanvasBox,
  fitted: MediaCanvasBox,
): MediaCanvasBox {
  return {
    x: clean(placement.x + fitted.x * placement.w),
    y: clean(placement.y + fitted.y * placement.h),
    w: clean(fitted.w * placement.w),
    h: clean(fitted.h * placement.h),
  };
}

/** Inverse of mediaContentBox: the editor manipulates the visible border, rendering persists the layer placement. */
export function mediaPlacementBox(
  content: MediaCanvasBox,
  fitted: MediaCanvasBox,
): MediaCanvasBox {
  const w = content.w / fitted.w;
  const h = content.h / fitted.h;
  return {
    x: clean(content.x - fitted.x * w),
    y: clean(content.y - fitted.y * h),
    w: clean(w),
    h: clean(h),
  };
}

const framedLocalContent = (
  fitted: MediaCanvasBox,
  inset: MediaFramingGeometry['inset'],
): MediaCanvasBox => {
  const x = Math.max(fitted.x, inset.l);
  const y = Math.max(fitted.y, inset.t);
  const right = Math.min(fitted.x + fitted.w, 1 - inset.r);
  const bottom = Math.min(fitted.y + fitted.h, 1 - inset.b);
  return {
    x,
    y,
    w: Math.max(0.0001, right - x),
    h: Math.max(0.0001, bottom - y),
  };
};

/** Resolve the visible border after source fitting, treatment crop, scale, and translation.
 * CSS applies the treatment around the layer centre, while xPercent/yPercent are measured in the
 * untransformed layer size. This matches #vidEl for split, corner, and punch-in treatments. */
export function framedMediaContentBox(
  placement: MediaCanvasBox,
  fitted: MediaCanvasBox,
  framing: MediaFramingGeometry,
): MediaCanvasBox {
  const local = framedLocalContent(fitted, framing.inset);
  const scale = Math.max(0.0001, framing.scale);
  return {
    x: clean(placement.x + placement.w * (0.5 + framing.xPercent / 100 + scale * (local.x - 0.5))),
    y: clean(placement.y + placement.h * (0.5 + framing.yPercent / 100 + scale * (local.y - 0.5))),
    w: clean(placement.w * scale * local.w),
    h: clean(placement.h * scale * local.h),
  };
}

/** Inverse of framedMediaContentBox. Drag/resize edits the visible treatment border, then this
 * recovers the persisted base placement without changing the treatment itself. */
export function framedMediaPlacementBox(
  content: MediaCanvasBox,
  fitted: MediaCanvasBox,
  framing: MediaFramingGeometry,
): MediaCanvasBox {
  const local = framedLocalContent(fitted, framing.inset);
  const scale = Math.max(0.0001, framing.scale);
  const w = content.w / (scale * local.w);
  const h = content.h / (scale * local.h);
  return {
    x: clean(content.x - w * (0.5 + framing.xPercent / 100 + scale * (local.x - 0.5))),
    y: clean(content.y - h * (0.5 + framing.yPercent / 100 + scale * (local.y - 0.5))),
    w: clean(w),
    h: clean(h),
  };
}

/** Move a video/image layer without changing its source crop or timeline range. Off-canvas placement is valid. */
export function moveMediaCanvasBox(
  box: MediaCanvasBox,
  dx: number,
  dy: number,
  snapX = 0,
  snapY = 0,
): MediaCanvasBox {
  let x = box.x + dx;
  let y = box.y + dy;
  const snappedLeft = snap(x, [0], snapX);
  const snappedRight = snap(x + box.w, [1], snapX);
  const snappedCenterX = snap(x + box.w / 2, [0.5], snapX);
  if (snappedLeft !== x) x = snappedLeft;
  else if (snappedRight !== x + box.w) x = snappedRight - box.w;
  else if (snappedCenterX !== x + box.w / 2) x = snappedCenterX - box.w / 2;
  const snappedTop = snap(y, [0], snapY);
  const snappedBottom = snap(y + box.h, [1], snapY);
  const snappedCenterY = snap(y + box.h / 2, [0.5], snapY);
  if (snappedTop !== y) y = snappedTop;
  else if (snappedBottom !== y + box.h) y = snappedBottom - box.h;
  else if (snappedCenterY !== y + box.h / 2) y = snappedCenterY - box.h / 2;
  return {
    x: clean(x),
    y: clean(y),
    w: box.w,
    h: box.h,
  };
}

/** Resize from one corner while the opposite corner stays anchored and the canvas aspect stays intact. */
export function scaleMediaCanvasBox(
  box: MediaCanvasBox,
  dx: number,
  dy: number,
  directionX: -1 | 1,
  directionY: -1 | 1,
  minWidth = 0.06,
  minHeight = 0.06,
): MediaCanvasBox {
  const factorX = 1 + (dx * directionX) / box.w;
  const factorY = 1 + (dy * directionY) / box.h;
  const requested = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
  const minFactor = Math.max(minWidth / box.w, minHeight / box.h, 0.01);
  const factor = Math.max(requested, minFactor);
  const w = box.w * factor;
  const h = box.h * factor;
  return {
    x: clean(directionX > 0 ? box.x : box.x + box.w - w),
    y: clean(directionY > 0 ? box.y : box.y + box.h - h),
    w: clean(w),
    h: clean(h),
  };
}

/** Resize one edge while keeping the opposite edge fixed. Unlike corner scaling this is intentionally
 *  non-proportional: the four side handles expose independent width/height adjustment. */
export function resizeMediaCanvasBox(
  box: MediaCanvasBox,
  delta: number,
  side: 'l' | 'r' | 't' | 'b',
  minWidth = 0.06,
  minHeight = 0.06,
): MediaCanvasBox {
  const next = { ...box };
  if (side === 'r') next.w = Math.max(minWidth, box.w + delta);
  else if (side === 'l') {
    next.w = Math.max(minWidth, box.w - delta);
    next.x = box.x + box.w - next.w;
  } else if (side === 'b') next.h = Math.max(minHeight, box.h + delta);
  else {
    next.h = Math.max(minHeight, box.h - delta);
    next.y = box.y + box.h - next.h;
  }
  return { x: clean(next.x), y: clean(next.y), w: clean(next.w), h: clean(next.h) };
}
