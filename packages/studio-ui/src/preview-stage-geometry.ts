export const PREVIEW_STAGE_VERTICAL_GUTTER_PX = 48;

const PREVIEW_STAGE_MIN_VISIBLE_HEIGHT_PX = 160;
const PREVIEW_STAGE_FALLBACK_WIDTH_PX = 320;

interface PreviewStageGeometryInput {
  areaW: number;
  areaH: number;
  canvasW: number;
  canvasH: number;
}

/**
 * Fit the video canvas inside the preview while reserving room for selection controls.
 * The canvas and every parent-side overlay consume this one geometry, so adding chrome
 * space cannot desynchronise hit testing, drag handles or iframe scaling.
 */
export function previewStageGeometry({
  areaW,
  areaH,
  canvasW,
  canvasH,
}: PreviewStageGeometryInput): { fit: number; width: number; height: number; gutterY: number } {
  if (![canvasW, canvasH].every((value) => Number.isFinite(value) && value > 0)) {
    return { fit: 1, width: 0, height: 0, gutterY: 0 };
  }

  if (!(areaW > 0 && areaH > 0)) {
    const fit = PREVIEW_STAGE_FALLBACK_WIDTH_PX / canvasW;
    return {
      fit,
      width: Math.round(canvasW * fit),
      height: Math.round(canvasH * fit),
      gutterY: 0,
    };
  }

  // Keep the full 48px toolbar/handle lane whenever the panel can afford it. In a
  // very short panel, preserve a usable canvas first and reduce the lane symmetrically.
  const gutterY = Math.min(
    PREVIEW_STAGE_VERTICAL_GUTTER_PX,
    Math.max(0, (areaH - PREVIEW_STAGE_MIN_VISIBLE_HEIGHT_PX) / 2),
  );
  const usableHeight = Math.max(1, areaH - gutterY * 2);
  const fit = Math.min(areaW / canvasW, usableHeight / canvasH);
  return {
    fit,
    width: Math.round(canvasW * fit),
    height: Math.round(canvasH * fit),
    gutterY,
  };
}
