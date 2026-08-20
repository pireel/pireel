/** Pure workbench helpers: canvas dimension normalization, shot spans, frame → PersonFx mapping. */

import { type Composition, type PersonFx, normalizeSourceCanvasSize } from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';

/** personFx recommendation from a frame content pack (kebab string map) → runtime PersonFx. */
export function personFxFromFrame(m: Record<string, string>): PersonFx {
  const num = (v: string | undefined): number | null => {
    const n = Number(v);
    return v != null && Number.isFinite(n) ? n : null;
  };
  const width = num(m['stroke-width']);
  return {
    ...(m['person-front'] === 'true' ? { personFront: true } : {}),
    ...(num(m['feather']) != null ? { feather: num(m['feather'])! } : {}),
    ...(width != null && width > 0
      ? {
          stroke: {
            style: m['stroke-style'] === 'dashed' ? ('dashed' as const) : ('solid' as const),
            width,
            color: m['stroke-color'] ?? '#FFFFFF',
            opacity: num(m['stroke-opacity']) ?? 1,
          },
        }
      : {}),
  };
}

/**
 * Canvas dimension normalization: **width always anchored to 1080 (fixed reference)**, height derived from video aspect ratio.
 * Key: px font sizes are calibrated to a 1080-wide canvas, so canvas width must stay fixed — otherwise the same "200px"
 * covers a different fraction of the frame across resolutions (error = 1080/actual width). No cropping, no distortion
 * (video fills via object-fit:cover), uniform scaling.
 */
export const REF_WIDTH = 1080;
/** Initial import canvas follows the SOURCE aspect with the short side normalized to 1080; set_canvas
 *  may replace it later. Portrait starts 1080×H, landscape W×1080, square 1080×1080.
 *  Caption geometry derives from the real width, so a 16:9 canvas holds a full single-line subtitle
 *  (~21em ≈ 42 latin chars) while portrait stays at the ~11-char line. */
export function normalizeDims(w: number, h: number): { width: number; height: number } {
  return normalizeSourceCanvasSize(w, h);
}

/** A shot's span on the final timeline (start + duration). */
export function shotSpan(c: Composition, sid: string): { editedStart: number; shotLen: number } | null {
  const shots = c.shots ?? [];
  const shot = shots.find((s) => s.id === sid);
  if (!shot) return null;
  const sp = clipSpans(shots).find((x) => x.clip.id === sid);
  const editedStart = sp?.editedStart ?? 0;
  const shotLen = sp ? sp.editedEnd - sp.editedStart : Math.max(0.1, shot.srcEnd - shot.srcStart);
  return { editedStart, shotLen };
}
