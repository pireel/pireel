/** Stable-id overlay edits shared by live/manual browser surfaces and the offline MCP executor. */

import {
  applyEditorCommand,
  positiveDurationFrames,
  secondsToTimelineFrames,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type GraphicBlockPayload,
  type OverlayClipPatchUpdate,
  type TimelineClip,
} from './editor-document';
import { assignClipToBestDirectorScene } from './semantic-scenes';

export interface OverlayDocumentPatch {
  clipId: string;
  startSec?: number;
  durationSec?: number;
  block?: Partial<GraphicBlockPayload>;
}

interface OverlayDocumentEditBase {
  document: EditorDocumentV2;
}

export interface OverlayDocumentPatchInput extends OverlayDocumentEditBase {
  updates: readonly OverlayDocumentPatch[];
}

export interface OverlayDocumentRemovalInput extends OverlayDocumentEditBase {
  clipIds: readonly string[];
}

export type OverlayDocumentEditResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  details: Pick<EditorCommandError, 'path' | 'trackIds'> = {},
): OverlayDocumentEditResult {
  return { ok: false, document, error: { code, message, ...details } };
}

function isOverlayClip(clip: TimelineClip): boolean {
  return clip.kind === 'graphic' || clip.kind === 'caption';
}

/** Apply overlay timing/payload changes as one publish transaction. */
export function applyOverlayDocumentEdits(input: OverlayDocumentPatchInput): OverlayDocumentEditResult {
  const updates: OverlayClipPatchUpdate[] = [];
  for (const [index, update] of input.updates.entries()) {
    if (update.startSec != null && (!Number.isFinite(update.startSec) || update.startSec < 0)) {
      return failure(input.document, 'invalid-range', 'Overlay startSec must be a non-negative finite number.', { path: `updates[${index}].startSec` });
    }
    if (update.durationSec != null && (!Number.isFinite(update.durationSec) || update.durationSec <= 0)) {
      return failure(input.document, 'invalid-range', 'Overlay durationSec must be a positive finite number.', { path: `updates[${index}].durationSec` });
    }
    const existing = input.document.timeline.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === update.clipId);
    if (
      existing?.kind === 'graphic'
      && existing.block.templateId === 'title'
      && update.block?.templateId != null
      && update.block.templateId !== 'title'
    ) {
      return failure(
        input.document,
        'invalid-command',
        'Native display text must remain editable. Update its text and styling instead of converting it to a custom Motion Graphic.',
        { path: `updates[${index}].block.templateId` },
      );
    }
    updates.push({
      clipId: update.clipId,
      patch: {
        ...(update.startSec != null ? { startFrame: secondsToTimelineFrames(update.startSec, input.document.canvas.fps) } : {}),
        ...(update.durationSec != null ? { durationFrames: positiveDurationFrames(update.durationSec, input.document.canvas.fps) } : {}),
        ...(update.block ? { block: update.block } : {}),
      },
    });
  }
  const command = applyEditorCommand(input.document, { type: 'overlay.patch', updates });
  if (!command.ok) return { ok: false, document: input.document, error: command.error };
  let document = command.document;
  for (const update of input.updates) {
    if (update.startSec == null && update.durationSec == null) continue;
    const assigned = assignClipToBestDirectorScene(document, update.clipId);
    if (!assigned.ok) return failure(input.document, 'invalid-command', assigned.error, { path: 'sceneId' });
    document = assigned.document;
  }
  return {
    ok: true,
    document,
    receipts: [command.receipt],
  };
}

/** Remove overlay identities across any number of lanes without shifting survivors. */
export function removeOverlayDocumentClips(input: OverlayDocumentRemovalInput): OverlayDocumentEditResult {
  const ids = [...new Set(input.clipIds)];
  if (!ids.length) return failure(input.document, 'invalid-command', 'At least one overlay clip id is required.', { path: 'clipIds' });
  const locations = new Map(input.document.timeline.tracks.flatMap((track) => (
    track.clips.map((clip) => [clip.id, { trackId: track.id, clip }] as const)
  )));
  const byTrack = new Map<string, string[]>();
  for (const [index, id] of ids.entries()) {
    const found = locations.get(id);
    if (!found) return failure(input.document, 'clip-not-found', `Clip does not exist: ${id}`, { path: `clipIds[${index}]` });
    if (!isOverlayClip(found.clip)) {
      return failure(input.document, 'invalid-command', `Clip is not an overlay: ${id}`, { path: `clipIds[${index}]`, trackIds: [found.trackId] });
    }
    byTrack.set(found.trackId, [...(byTrack.get(found.trackId) ?? []), id]);
  }

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [trackId, clipIds] of byTrack) {
    const command = applyEditorCommand(document, {
      type: 'clips.remove',
      trackId,
      clipIds,
      includeLinked: false,
    });
    if (!command.ok) return { ok: false, document: input.document, error: command.error };
    document = command.document;
    receipts.push(command.receipt);
  }
  return {
    ok: true,
    document,
    receipts,
  };
}
