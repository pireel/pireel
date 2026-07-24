/** Pure workbench helpers: canvas dimension normalization, shot spans, frame → PersonFx mapping. */

import { type Composition, type PersonFx, treatmentVacancyBox } from '@pireel/studio-engine/composition';
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
export function normalizeDims(w: number, h: number): { width: number; height: number } {
  if (!w || !h) return { width: REF_WIDTH, height: 1920 };
  return { width: REF_WIDTH, height: Math.round((REF_WIDTH * h) / w) };
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

/**
 * When framing has a vacancy (half-cut/corner-shrink) and the shot **already has** a partner block:
 * align it to the new vacancy box + full shot span.
 * **Update-only, never create** ("what goes in the other half" entry was cut; a partner can only come from a legacy link):
 * no vacancy (full/zoom) returns as-is — keep any existing partner block and link, don't auto-delete (avoids wiping user content).
 */
export function syncVacancyPartner(c: Composition, sid: string): Composition {
  const shots = c.shots ?? [];
  const shot = shots.find((s) => s.id === sid);
  if (!shot) return c;
  const vac = treatmentVacancyBox(shot.treatment, shot.treatSize);
  if (!vac) return c;
  const existing = shot.partnerBlockId ? c.blocks.find((b) => b.id === shot.partnerBlockId) : null;
  if (!existing) return c;
  const span = shotSpan(c, sid)!;
  return {
    ...c,
    blocks: c.blocks.map((b) => (b.id === existing.id ? { ...b, box: vac, startSec: span.editedStart, durationSec: Math.max(0.3, span.shotLen) } : b)),
  };
}
