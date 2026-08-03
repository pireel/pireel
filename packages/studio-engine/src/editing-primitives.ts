/**
 * Agent-native editing primitives shared by the live workbench and the offline MCP executor.
 *
 * This module deliberately contains no React, browser, persistence, or provider code. A tool first
 * computes one complete next Composition here, then the caller validates and commits it once. That
 * keeps chat, MCP, preview and export on one data model instead of growing surface-specific edits.
 */

import {
  type Block,
  type Composition,
  type NormBox,
  type ShotFramingPatch,
  type ShotTreatment,
  type VideoShot,
  SHOT_TREATMENTS,
  patchShotFraming,
  treatmentVacancyBox,
} from './composition-core';
import { spans as clipSpans } from './trim';

export const CANVAS_PRESETS = ['portrait', 'landscape', 'square'] as const;
export type CanvasPreset = (typeof CANVAS_PRESETS)[number];

export const LAYOUT_KINDS = ['picture-in-picture', 'split-left-right', 'split-top-bottom', 'grid'] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

const PRESET_SIZE: Record<CanvasPreset, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Resolve a canvas tool input. Custom output is even-sized for codecs and bounded to a practical
 *  browser-render range; preset aliases let an agent use the user's aspect-ratio wording directly. */
export function canvasSizeFromInput(input: Record<string, unknown>): { width: number; height: number } | null {
  const raw = typeof input.preset === 'string' ? input.preset.toLowerCase() : '';
  const preset: CanvasPreset | null =
    raw === 'portrait' || raw === 'vertical' || raw === '9:16'
      ? 'portrait'
      : raw === 'landscape' || raw === 'horizontal' || raw === '16:9'
        ? 'landscape'
        : raw === 'square' || raw === '1:1'
          ? 'square'
          : null;
  if (preset) return PRESET_SIZE[preset];
  if (!finite(input.width) || !finite(input.height)) return null;
  if (input.width < 240 || input.height < 240 || input.width > 7680 || input.height > 7680) return null;
  return { width: even(input.width), height: even(input.height) };
}

export interface AppliedShotFraming {
  shotId: string;
  treatment: ShotTreatment;
  size?: number;
  crop?: number;
  framing: VideoShot['preciseFraming'] | null;
}

export interface ShotFramingResult {
  comp: Composition;
  updates: AppliedShotFraming[];
}

const SHOT_TREATMENT_IDS = new Set<ShotTreatment>(SHOT_TREATMENTS.map((item) => item.id));
const SHOT_FRAMING_NUMBERS = ['size', 'crop', 'scale', 'anchorX', 'anchorY'] as const;
const SHOT_FRAMING_FIELDS = ['shotId', 'atSec', 'treatment', ...SHOT_FRAMING_NUMBERS, 'coordinateSpace', 'resetPrecision'] as const;

function framingRows(input: Record<string, unknown>): Record<string, unknown>[] | { error: string } {
  if (!('updates' in input)) return [input];
  if (!Array.isArray(input.updates)) return { error: 'updates must be an array' };
  if (!input.updates.length) return { error: 'updates must contain at least one framing update' };
  if (input.updates.length > 120) return { error: 'updates supports at most 120 shots per call' };
  if (SHOT_FRAMING_FIELDS.some((key) => key in input)) return { error: 'use either updates[] or top-level framing fields, not both' };
  const invalid = input.updates.findIndex((row) => !row || typeof row !== 'object' || Array.isArray(row));
  if (invalid >= 0) return { error: `updates[${invalid}] must be an object` };
  return input.updates as Record<string, unknown>[];
}

/** Resolve and apply one or many exact shot-framing edits as one pure transaction. Every row is
 * validated against the same pre-edit timeline before anything changes, so a stale id or malformed
 * late row cannot leave a partially reframed composition. */
export function applyShotFramingInput(
  comp: Composition,
  input: Record<string, unknown>,
  fallbackShots: VideoShot[] = comp.shots ?? [],
): ShotFramingResult | { error: string } {
  const rows = framingRows(input);
  if ('error' in rows) return rows;
  const shots = fallbackShots;
  const timeline = clipSpans(shots);
  const resolved: { shot: VideoShot; patch: ShotFramingPatch }[] = [];
  const targeted = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const prefix = rows.length > 1 ? `updates[${index}]: ` : '';
    const requestedId = typeof row.shotId === 'string' ? row.shotId.replace(/^@/, '') : null;
    const requestedAt = finite(row.atSec) ? row.atSec : null;
    const spanAt =
      requestedAt == null
        ? null
        : timeline.find(
            (span, spanIndex, all) =>
              requestedAt >= span.editedStart - 1e-6 &&
              (requestedAt < span.editedEnd - 1e-6 || (spanIndex === all.length - 1 && requestedAt <= span.editedEnd + 1e-6)),
          );
    const shot = requestedId ? shots.find((candidate) => candidate.id === requestedId) : spanAt?.clip;
    if (!shot) return { error: `${prefix}${requestedId || requestedAt != null ? 'shot not found' : 'pass shotId or atSec'}` };
    if (targeted.has(shot.id)) return { error: `${prefix}shot ${shot.id} is targeted more than once` };

    const treatment = row.treatment == null ? undefined : String(row.treatment);
    if (treatment && !SHOT_TREATMENT_IDS.has(treatment as ShotTreatment)) return { error: `${prefix}invalid treatment: ${treatment}` };
    const coordinateSpace = row.coordinateSpace == null ? undefined : String(row.coordinateSpace);
    if (coordinateSpace && coordinateSpace !== 'source-normalized') return { error: `${prefix}invalid coordinateSpace: ${coordinateSpace}` };
    const invalidNumber = SHOT_FRAMING_NUMBERS.find((key) => key in row && !finite(row[key]));
    if (invalidNumber) return { error: `${prefix}${invalidNumber} must be a finite number` };
    const resolvedTreatment = (treatment ?? shot.treatment) as ShotTreatment;
    if ((row.scale != null || row.anchorX != null || row.anchorY != null) && resolvedTreatment !== 'full' && resolvedTreatment !== 'punch-in') {
      return { error: `${prefix}scale/anchorX/anchorY are valid only for full or punch-in framing` };
    }
    const patch: ShotFramingPatch = {
      ...(treatment ? { treatment: treatment as ShotTreatment } : {}),
      ...Object.fromEntries(SHOT_FRAMING_NUMBERS.filter((key) => finite(row[key])).map((key) => [key, row[key]])),
      ...(coordinateSpace === 'source-normalized' ? { coordinateSpace: 'source-normalized' as const } : {}),
      ...(typeof row.resetPrecision === 'boolean' ? { resetPrecision: row.resetPrecision } : {}),
    };
    if (!Object.keys(patch).length) {
      return { error: `${prefix}pass treatment / size / crop / scale / anchorX / anchorY / coordinateSpace / resetPrecision` };
    }
    targeted.add(shot.id);
    resolved.push({ shot, patch });
  }

  const patchById = new Map(resolved.map(({ shot, patch }) => [shot.id, patch]));
  const nextShots = shots.map((shot) => {
    const patch = patchById.get(shot.id);
    return patch ? patchShotFraming(shot, patch) : shot;
  });

  // Preserve the existing layout contract for legacy partner links: if an updated shot exposes a
  // vacancy, move its already-linked block to that exact region and shot span. Never create blocks.
  const nextTimeline = clipSpans(nextShots);
  const blockPatches = new Map<string, Partial<Block>>();
  for (const shotId of targeted) {
    const shot = nextShots.find((candidate) => candidate.id === shotId);
    const vacancy = shot ? treatmentVacancyBox(shot.treatment, shot.treatSize) : null;
    const span = nextTimeline.find((candidate) => candidate.clip.id === shotId);
    if (!shot?.partnerBlockId || !vacancy || !span || !comp.blocks.some((block) => block.id === shot.partnerBlockId)) continue;
    blockPatches.set(shot.partnerBlockId, {
      box: vacancy,
      startSec: span.editedStart,
      durationSec: Math.max(0.3, span.editedEnd - span.editedStart),
    });
  }
  const blocks = blockPatches.size
    ? comp.blocks.map((block) => (blockPatches.has(block.id) ? { ...block, ...blockPatches.get(block.id)! } : block))
    : comp.blocks;
  const nextComp: Composition = { ...comp, blocks, shots: nextShots };
  return {
    comp: nextComp,
    updates: resolved.map(({ shot }) => {
      const next = nextShots.find((candidate) => candidate.id === shot.id)!;
      return {
        shotId: next.id,
        treatment: next.treatment,
        ...(next.treatSize != null ? { size: next.treatSize } : {}),
        ...(next.treatCrop != null ? { crop: next.treatCrop } : {}),
        framing: next.preciseFraming ?? null,
      };
    }),
  };
}

export interface LayoutInput {
  layout: LayoutKind;
  blockIds: string[];
  shotId?: string;
  /** Which side the VIDEO occupies for split layouts. */
  videoPosition?: 'left' | 'right' | 'top' | 'bottom';
}

export interface LayoutResult {
  comp: Composition;
  blockIds: string[];
  shotId?: string;
  treatment?: ShotTreatment;
}

const CONTENT: NormBox = { x: 0.04, y: 0.04, w: 0.92, h: 0.78 };

function insetBox(box: NormBox, inset = 0.02): NormBox {
  return {
    x: r4(box.x + inset),
    y: r4(box.y + inset),
    w: r4(Math.max(0.04, box.w - inset * 2)),
    h: r4(Math.max(0.04, box.h - inset * 2)),
  };
}

function splitRects(box: NormBox, count: number, axis: 'x' | 'y'): NormBox[] {
  const gap = 0.025;
  const n = Math.max(1, count);
  if (axis === 'x') {
    const w = (box.w - gap * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x: r4(box.x + i * (w + gap)), y: box.y, w: r4(w), h: box.h }));
  }
  const h = (box.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: box.x, y: r4(box.y + i * (h + gap)), w: box.w, h: r4(h) }));
}

function gridRects(box: NormBox, count: number): NormBox[] {
  const cols = count <= 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const rowBoxes = splitRects(box, rows, 'y');
  return rowBoxes.flatMap((row, ri) => splitRects(row, Math.min(cols, count - ri * cols), 'x')).slice(0, count);
}

function rectsFor(layout: LayoutKind, box: NormBox, count: number): NormBox[] {
  if (layout === 'split-left-right') return splitRects(box, count, 'x');
  if (layout === 'split-top-bottom') return splitRects(box, count, 'y');
  if (layout === 'grid') return gridRects(box, count);
  if (count === 1) return [{ x: r4(box.x + box.w * 0.62), y: r4(box.y + 0.03), w: r4(box.w * 0.35), h: r4(box.h * 0.34) }];
  // Picture-in-picture with two blocks: first is the stage, second is the inset.
  return [box, { x: r4(box.x + box.w * 0.64), y: r4(box.y + 0.035), w: r4(box.w * 0.32), h: r4(box.h * 0.31) }];
}

function placeBlock(block: Block, box: NormBox): Block {
  const { contentBox: _contentBox, fitScale: _fitScale, ...rest } = block;
  return { ...rest, box };
}

/** Apply an intent-level multi-element layout. The layout writes only normalized canvas boxes and
 *  shot framing, so changing resolution later preserves it. With a shot target, split layouts put
 *  the video on the requested side and subdivide the treatment's actual vacancy for the blocks. */
export function applyCompositionLayout(comp: Composition, input: LayoutInput): LayoutResult | { error: string } {
  if (!LAYOUT_KINDS.includes(input.layout)) return { error: `invalid layout: ${input.layout}` };
  if (input.videoPosition && !input.shotId) return { error: 'videoPosition requires shotId' };
  if (input.videoPosition && input.layout === 'split-left-right' && input.videoPosition !== 'left' && input.videoPosition !== 'right') {
    return { error: 'split-left-right videoPosition must be left or right' };
  }
  if (input.videoPosition && input.layout === 'split-top-bottom' && input.videoPosition !== 'top' && input.videoPosition !== 'bottom') {
    return { error: 'split-top-bottom videoPosition must be top or bottom' };
  }
  if (input.videoPosition && input.layout !== 'split-left-right' && input.layout !== 'split-top-bottom') {
    return { error: 'videoPosition applies only to split layouts' };
  }
  const ids = [...new Set(input.blockIds)];
  if (!ids.length || ids.length > 4) return { error: 'blockIds must contain 1–4 ids' };
  const byId = new Map(comp.blocks.map((b) => [b.id, b]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) return { error: `block not found: ${missing.join(', ')}` };

  let region = CONTENT;
  let nextShots = comp.shots;
  let treatment: ShotTreatment | undefined;
  if (input.shotId) {
    const shot = comp.shots?.find((s) => s.id === input.shotId);
    if (!shot) return { error: 'shot not found' };
    if (input.layout === 'split-left-right') {
      const pos = input.videoPosition === 'right' ? 'right' : 'left';
      treatment = pos === 'right' ? 'split-r' : 'split-l';
    } else if (input.layout === 'split-top-bottom') {
      const pos = input.videoPosition === 'top' ? 'top' : 'bottom';
      treatment = pos === 'top' ? 'split-t' : 'split-b';
    } else {
      treatment = 'full';
    }
    const patched = patchShotFraming(shot, { treatment, ...(treatment.startsWith('split-') ? { size: 50 } : {}) });
    patched.partnerBlockId = ids[0];
    nextShots = comp.shots!.map((s) => (s.id === shot.id ? patched : s));
    const vacancy = treatmentVacancyBox(treatment, patched.treatSize);
    region = vacancy ? insetBox(vacancy, 0.015) : CONTENT;
  }

  const rects = rectsFor(input.layout, region, ids.length);
  const rectById = new Map(ids.map((id, i) => [id, rects[i]!]));
  const blocks = comp.blocks.map((b) => (rectById.has(b.id) ? placeBlock(b, rectById.get(b.id)!) : b));
  return {
    comp: { ...comp, blocks, ...(nextShots ? { shots: nextShots } : {}) },
    blockIds: ids,
    ...(input.shotId ? { shotId: input.shotId } : {}),
    ...(treatment ? { treatment } : {}),
  };
}

export interface CompositionIssue {
  path: string;
  message: string;
}

/** Structural guard at the Agent mutation boundary. It intentionally validates invariants shared by
 *  every renderer without retroactively rejecting harmless legacy styling values. */
export function validateComposition(comp: Composition): CompositionIssue[] {
  const issues: CompositionIssue[] = [];
  if (!finite(comp.width) || !finite(comp.height) || comp.width < 2 || comp.height < 2) {
    issues.push({ path: 'canvas', message: 'width and height must be finite positive numbers' });
  }
  const unique = (items: { id: string }[], path: string) => {
    const seen = new Set<string>();
    for (const [i, item] of items.entries()) {
      if (!item.id) issues.push({ path: `${path}[${i}].id`, message: 'id is required' });
      else if (seen.has(item.id)) issues.push({ path: `${path}[${i}].id`, message: `duplicate id ${item.id}` });
      seen.add(item.id);
    }
  };
  unique(comp.blocks, 'blocks');
  unique(comp.shots ?? [], 'shots');
  for (const [i, b] of comp.blocks.entries()) {
    if (!finite(b.startSec) || !finite(b.durationSec) || b.startSec < 0 || b.durationSec <= 0) {
      issues.push({ path: `blocks[${i}]`, message: 'startSec/durationSec must describe a positive timeline window' });
    }
    if (b.box && (![b.box.x, b.box.y, b.box.w, b.box.h].every(finite) || b.box.w <= 0 || b.box.h <= 0)) {
      issues.push({ path: `blocks[${i}].box`, message: 'box must contain finite positive geometry' });
    }
  }
  for (const [i, s] of (comp.shots ?? []).entries()) {
    if (!finite(s.srcStart) || !finite(s.srcEnd) || s.srcStart < 0 || s.srcEnd <= s.srcStart) {
      issues.push({ path: `shots[${i}]`, message: 'srcStart/srcEnd must describe a positive source window' });
    }
    const p = s.preciseFraming;
    if (p && (s.treatment !== 'full' && s.treatment !== 'punch-in')) {
      issues.push({ path: `shots[${i}].preciseFraming`, message: 'precise framing is valid only for full/punch-in' });
    } else if (p && (!finite(p.scale) || p.scale < 1 || p.scale > 4 || !finite(p.anchorX) || p.anchorX < 0 || p.anchorX > 1 || !finite(p.anchorY) || p.anchorY < 0 || p.anchorY > 1)) {
      issues.push({ path: `shots[${i}].preciseFraming`, message: 'scale must be 1..4 and anchors 0..1' });
    } else if (p?.coordinateSpace != null && p.coordinateSpace !== 'source-normalized') {
      issues.push({ path: `shots[${i}].preciseFraming.coordinateSpace`, message: 'unsupported precise-framing coordinate space' });
    }
  }
  return issues;
}
