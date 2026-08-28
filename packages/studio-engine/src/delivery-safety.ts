export interface DeliveryCanvas {
  width?: number;
  height?: number;
}

/** Conservative feed-safe field for a 9:16 canvas. Platform chrome varies, so this protects
 * essential content globally while still allowing backgrounds and decorative texture to bleed. */
export const NINE_SIXTEEN_SAFE_AREA = {
  leftPct: 8,
  rightPct: 20,
  topPct: 12,
  bottomPct: 28,
} as const;

export const NINE_SIXTEEN_CAPTION_MAX_Y_PCT = 72;

export function isNineSixteenCanvas(canvas: DeliveryCanvas | null | undefined): boolean {
  const width = Number(canvas?.width);
  const height = Number(canvas?.height);
  if (!(width > 0) || !(height > 0) || width >= height) return false;
  return Math.abs(width / height - 9 / 16) <= 0.01;
}

export function deliverySafetyForCanvas(canvas: DeliveryCanvas | null | undefined): string | undefined {
  if (!isNineSixteenCanvas(canvas)) return undefined;
  return 'Global 9:16 delivery-safe field: keep faces, key body action, products, evidence, titles, captions, emphasis text, prices, terms and CTA fully inside x=8–80% and y=12–72% of the canvas. Reserve the right 20% and bottom 28% for feed chrome, and the top 12% for device/platform overlays. Backgrounds and nonessential decoration may bleed. This is a conservative product field because actual interface chrome varies.';
}

export function captionYPctForCanvas(
  canvas: DeliveryCanvas | null | undefined,
  requestedYPct: unknown,
): number | undefined {
  const requested = Number(requestedYPct);
  if (isNineSixteenCanvas(canvas)) {
    return Number.isFinite(requested)
      ? Math.min(NINE_SIXTEEN_CAPTION_MAX_Y_PCT, requested)
      : undefined;
  }
  return Number.isFinite(requested) ? requested : undefined;
}
