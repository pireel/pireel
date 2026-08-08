import {
  atomicMediaFramingFromTreatment,
  IDENTITY_MEDIA_FRAMING,
  normalizeAtomicMediaFraming,
  type AtomicMediaFraming,
} from './composition-core';
import { applyEditorCommand, type EditorDocumentV2, type NarrativeTimelineClip, type TimelineClip } from './editor-document';

export interface AppliedMediaFramingUpdate {
  clipId: string;
  mediaFraming: AtomicMediaFraming;
}

export type MediaFramingEditResult =
  | { ok: true; document: EditorDocumentV2; updates: AppliedMediaFramingUpdate[] }
  | { ok: false; error: string; data?: unknown };

type FramingClip = TimelineClip & ({ kind: 'narrative' } | { kind: 'media' });

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function baseFraming(clip: FramingClip): AtomicMediaFraming {
  if (clip.mediaFraming) return normalizeAtomicMediaFraming(clip.mediaFraming);
  if (clip.kind === 'narrative') {
    const narrative = clip as NarrativeTimelineClip;
    return atomicMediaFramingFromTreatment(
      narrative.properties.treatment ?? 'full',
      narrative.properties.treatSize,
      narrative.properties.treatCrop,
      narrative.properties.preciseFraming,
    );
  }
  return IDENTITY_MEDIA_FRAMING;
}

function rows(input: Record<string, unknown>): Record<string, unknown>[] | { error: string } {
  if (!Array.isArray(input.items) || !input.items.length) return { error: 'items must contain at least one media framing update' };
  if (input.items.length > 120) return { error: 'items supports at most 120 clips per call' };
  const invalid = input.items.findIndex((row) => !row || typeof row !== 'object' || Array.isArray(row));
  return invalid >= 0 ? { error: `items[${invalid}] must be an object` } : input.items as Record<string, unknown>[];
}

function framingLocations(document: EditorDocumentV2) {
  return new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, { trackId: track.id, clip }] as const)));
}

/** Batch-edit the layer transform atom. Placement (clip.box) remains an independent transform atom. */
export function applyMediaTransformInput(document: EditorDocumentV2, input: Record<string, unknown>): MediaFramingEditResult {
  const parsed = rows(input);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const locations = framingLocations(document);
  const seen = new Set<string>();
  const prepared: Array<{ clipId: string; trackId: string; framing: AtomicMediaFraming }> = [];
  for (const [index, row] of parsed.entries()) {
    const clipId = typeof row.clipId === 'string' ? row.clipId.replace(/^@/, '') : '';
    const prefix = `items[${index}]`;
    if (!clipId) return { ok: false, error: `${prefix}.clipId is required` };
    if (seen.has(clipId)) return { ok: false, error: `${prefix}: clip ${clipId} is targeted more than once` };
    seen.add(clipId);
    const found = locations.get(clipId);
    if (!found) return { ok: false, error: `${prefix}: clip not found: ${clipId}` };
    if (found.clip.kind !== 'narrative' && found.clip.kind !== 'media') return { ok: false, error: `${prefix}: clip is not visual media: ${clipId}` };
    const reset = row.reset === true;
    if (!reset && !['scale', 'offsetX', 'offsetY'].some((key) => key in row)) {
      return { ok: false, error: `${prefix}: pass scale / offsetX / offsetY or reset=true` };
    }
    for (const key of ['scale', 'offsetX', 'offsetY'] as const) {
      if (key in row && !finite(row[key])) return { ok: false, error: `${prefix}.${key} must be a finite number` };
    }
    if (finite(row.scale) && (row.scale < 0.05 || row.scale > 20)) return { ok: false, error: `${prefix}.scale must be within 0.05..20` };
    if (finite(row.offsetX) && Math.abs(row.offsetX) > 20) return { ok: false, error: `${prefix}.offsetX must be within -20..20` };
    if (finite(row.offsetY) && Math.abs(row.offsetY) > 20) return { ok: false, error: `${prefix}.offsetY must be within -20..20` };
    const base = baseFraming(found.clip as FramingClip);
    const transform = reset
      ? IDENTITY_MEDIA_FRAMING.transform
      : {
          scale: finite(row.scale) ? row.scale : base.transform.scale,
          offsetX: finite(row.offsetX) ? row.offsetX : base.transform.offsetX,
          offsetY: finite(row.offsetY) ? row.offsetY : base.transform.offsetY,
        };
    prepared.push({
      clipId,
      trackId: found.trackId,
      framing: normalizeAtomicMediaFraming({ ...base, transform }),
    });
  }
  let next = document;
  for (const update of prepared) {
    const result = applyEditorCommand(next, {
      type: 'clip.patch',
      trackId: update.trackId,
      clipId: update.clipId,
      patch: { mediaFraming: update.framing },
    });
    if (!result.ok) return { ok: false, error: result.error.message, data: { code: result.error.code, trackIds: result.error.trackIds } };
    next = result.document;
  }
  return { ok: true, document: next, updates: prepared.map(({ clipId, framing }) => ({ clipId, mediaFraming: framing })) };
}

/** Batch-edit normalized layer-local crop insets without moving the clip or changing its timeline. */
export function applyMediaCropInput(document: EditorDocumentV2, input: Record<string, unknown>): MediaFramingEditResult {
  const parsed = rows(input);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const locations = framingLocations(document);
  const seen = new Set<string>();
  const prepared: Array<{ clipId: string; trackId: string; framing: AtomicMediaFraming }> = [];
  for (const [index, row] of parsed.entries()) {
    const clipId = typeof row.clipId === 'string' ? row.clipId.replace(/^@/, '') : '';
    const prefix = `items[${index}]`;
    if (!clipId) return { ok: false, error: `${prefix}.clipId is required` };
    if (seen.has(clipId)) return { ok: false, error: `${prefix}: clip ${clipId} is targeted more than once` };
    seen.add(clipId);
    const found = locations.get(clipId);
    if (!found) return { ok: false, error: `${prefix}: clip not found: ${clipId}` };
    if (found.clip.kind !== 'narrative' && found.clip.kind !== 'media') return { ok: false, error: `${prefix}: clip is not visual media: ${clipId}` };
    const reset = row.reset === true;
    if (!reset && !['top', 'right', 'bottom', 'left'].some((key) => key in row)) {
      return { ok: false, error: `${prefix}: pass top / right / bottom / left or reset=true` };
    }
    for (const key of ['top', 'right', 'bottom', 'left'] as const) {
      if (key in row && (!finite(row[key]) || row[key] < 0 || row[key] >= 1)) {
        return { ok: false, error: `${prefix}.${key} must be within 0..<1` };
      }
    }
    const base = baseFraming(found.clip as FramingClip);
    const crop = reset
      ? IDENTITY_MEDIA_FRAMING.crop
      : {
          top: finite(row.top) ? row.top : base.crop.top,
          right: finite(row.right) ? row.right : base.crop.right,
          bottom: finite(row.bottom) ? row.bottom : base.crop.bottom,
          left: finite(row.left) ? row.left : base.crop.left,
        };
    if (crop.left + crop.right >= 0.999 || crop.top + crop.bottom >= 0.999) {
      return { ok: false, error: `${prefix}: opposing crop insets must leave visible content` };
    }
    prepared.push({
      clipId,
      trackId: found.trackId,
      framing: normalizeAtomicMediaFraming({ ...base, crop }),
    });
  }
  let next = document;
  for (const update of prepared) {
    const result = applyEditorCommand(next, {
      type: 'clip.patch',
      trackId: update.trackId,
      clipId: update.clipId,
      patch: { mediaFraming: update.framing },
    });
    if (!result.ok) return { ok: false, error: result.error.message, data: { code: result.error.code, trackIds: result.error.trackIds } };
    next = result.document;
  }
  return { ok: true, document: next, updates: prepared.map(({ clipId, framing }) => ({ clipId, mediaFraming: framing })) };
}
