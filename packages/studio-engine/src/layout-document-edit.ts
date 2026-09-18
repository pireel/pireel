/** Atomic intent-level layout transaction over native narrative and overlay clip identities. */

import type { Composition } from './composition-core';
import {
  applyCompositionLayout,
  type LayoutInput,
  type LayoutResult,
} from './editing-primitives';
import {
  patchNarrativeClips,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type NarrativeClipPatchUpdate,
} from './editor-document';
import { applyOverlayDocumentEdits, type OverlayDocumentPatch } from './overlay-document-edit';

export interface LayoutDocumentEditInput {
  document: EditorDocumentV2;
  /** Current render projection is used only to calculate normalized layout geometry. */
  composition: Composition;
  layout: LayoutInput;
}

export type LayoutDocumentEditResult =
  | {
      ok: true;
      document: EditorDocumentV2;
      receipts: EditorCommandReceipt[];
      layout: Omit<LayoutResult, 'comp'>;
    }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

function invalid(document: EditorDocumentV2, message: string): LayoutDocumentEditResult {
  return { ok: false, document, error: { code: 'invalid-command', message } };
}

/**
 * Plans with the existing intent-level layout primitive, then commits its narrative link/framing and
 * every overlay box through V2 commands. No intermediate document is published: if any target lane
 * is locked or missing, callers receive the exact original document.
 */
export function applyLayoutDocumentEdit(input: LayoutDocumentEditInput): LayoutDocumentEditResult {
  const applied = applyCompositionLayout(input.composition, input.layout);
  if ('error' in applied) return invalid(input.document, applied.error);

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  // A layout arranges boxes; the shot framing's partner-link rule would also stretch the first
  // graphic to the shot's whole span. Remember each overlay's timing and put it back.
  const fps = input.document.canvas.fps;
  const timing = new Map(input.document.timeline.tracks.flatMap((track) => track.clips
    .filter((clip) => applied.blockIds.includes(clip.id))
    .map((clip) => [clip.id, { startFrame: clip.startFrame, durationFrames: clip.durationFrames }] as const)));
  if (applied.shotId) {
    const shot = applied.comp.shots?.find((candidate) => candidate.id === applied.shotId);
    if (!shot || !applied.treatment) return invalid(input.document, 'layout did not produce the targeted shot framing');
    const updates: NarrativeClipPatchUpdate[] = [{
      clipId: shot.id,
      patch: {
        framing: {
          treatment: applied.treatment,
          ...(applied.treatment.startsWith('split-') ? { size: shot.treatSize ?? 50 } : {}),
        },
        partnerBlockId: applied.blockIds[0]!,
      },
    }];
    const narrative = patchNarrativeClips(document, updates);
    if (!narrative.ok) return { ok: false, document: input.document, error: narrative.error };
    document = narrative.document;
    receipts.push(narrative.receipt);
  }

  const byId = new Map(applied.comp.blocks.map((block) => [block.id, block] as const));
  const placedNow = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
  const updates: OverlayDocumentPatch[] = applied.blockIds.map((clipId) => {
    const block = byId.get(clipId)!;
    const before = timing.get(clipId);
    const now = placedNow.get(clipId);
    const retimed = before && now && (now.startFrame !== before.startFrame || now.durationFrames !== before.durationFrames);
    return {
      clipId,
      ...(retimed ? { startSec: before.startFrame / fps, durationSec: before.durationFrames / fps } : {}),
      block: {
        box: block.box,
        contentBox: undefined,
        fitScale: undefined,
      },
    };
  });
  const overlays = applyOverlayDocumentEdits({ document, updates });
  if (!overlays.ok) return { ok: false, document: input.document, error: overlays.error };
  receipts.push(...overlays.receipts);
  const { comp: _renderProjection, ...layout } = applied;
  return { ok: true, document: overlays.document, receipts, layout };
}
