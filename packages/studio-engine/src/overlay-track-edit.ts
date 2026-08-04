/** First-class overlay lane placement, duplication and z-order transactions. */

import {
  applyEditorCommand,
  positiveDurationFrames,
  secondsToTimelineFrames,
  type EditorMediaAsset,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
} from './editor-document';
import type { Block } from './composition-core';
import type { OverlayDocumentEditResult } from './overlay-document-edit';

type OverlayDocumentEditFailure = Extract<OverlayDocumentEditResult, { ok: false }>;

export interface NewOverlayTrackInput {
  id: string;
  stackOrder: number;
  name?: string;
  index?: number;
}

interface OverlayTrackTarget {
  toTrackId?: string;
  newTrack?: NewOverlayTrackInput;
}

export interface MoveOverlayDocumentClipInput extends OverlayTrackTarget {
  document: EditorDocumentV2;
  clipId: string;
}

export interface DuplicateOverlayDocumentClipInput extends OverlayTrackTarget {
  document: EditorDocumentV2;
  clipId: string;
  newClipId: string;
  startSec: number;
}

export interface InsertOverlayDocumentClipInput extends Partial<OverlayTrackTarget> {
  document: EditorDocumentV2;
  block: Block;
  asset?: EditorMediaAsset;
}

export type InsertOverlayDocumentClipResult = OverlayDocumentEditResult & {
  clipId?: string;
  trackId?: string;
  assetId?: string;
};

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  details: Pick<EditorCommandError, 'path' | 'trackIds'> = {},
): OverlayDocumentEditFailure {
  return { ok: false, document, error: { code, message, ...details } };
}

function targetError(document: EditorDocumentV2, target: OverlayTrackTarget): OverlayDocumentEditFailure | null {
  if (!!target.toTrackId === !!target.newTrack) {
    return failure(document, 'invalid-command', 'Choose exactly one existing or new overlay target lane.', { path: 'toTrackId' });
  }
  if (target.newTrack && !Number.isFinite(target.newTrack.stackOrder)) {
    return failure(document, 'invalid-range', 'New overlay stackOrder must be finite.', { path: 'newTrack.stackOrder' });
  }
  return null;
}

function insertTargetTrack(
  original: EditorDocumentV2,
  target: OverlayTrackTarget,
): { ok: true; document: EditorDocumentV2; trackId: string; receipts: EditorCommandReceipt[] } | OverlayDocumentEditFailure {
  const invalid = targetError(original, target);
  if (invalid) return invalid;
  if (target.toTrackId) return { ok: true, document: original, trackId: target.toTrackId, receipts: [] };
  const newTrack = target.newTrack!;
  const inserted = applyEditorCommand(original, {
    type: 'track.insert',
    ...(newTrack.index != null ? { index: newTrack.index } : {}),
    track: {
      id: newTrack.id,
      type: 'graphics',
      role: 'graphics',
      ...(newTrack.name ? { name: newTrack.name } : {}),
      syncLocked: true,
      stackOrder: newTrack.stackOrder,
    },
  });
  if (!inserted.ok) return { ok: false, document: original, error: inserted.error };
  return { ok: true, document: inserted.document, trackId: newTrack.id, receipts: [inserted.receipt] };
}

function uniqueTrackId(document: EditorDocumentV2, stackOrder: number): string {
  const used = new Set(document.timeline.tracks.map((track) => track.id));
  const stem = `track_graphics_${Math.max(1, Math.round(stackOrder))}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

/** Insert a legacy-shaped Block through a native graphic clip/lane identity. */
export function insertOverlayDocumentClip(input: InsertOverlayDocumentClipInput): InsertOverlayDocumentClipResult {
  if (!input.block.id.trim()) return failure(input.document, 'invalid-command', 'Overlay block id is required.', { path: 'block.id' });
  if (!Number.isFinite(input.block.startSec) || input.block.startSec < 0 || !Number.isFinite(input.block.durationSec) || input.block.durationSec <= 0) {
    return failure(input.document, 'invalid-range', 'Overlay block needs a non-negative start and positive duration.', { path: 'block' });
  }
  const stackOrder = Number.isFinite(input.block.trackIndex) ? Math.max(1, Math.round(input.block.trackIndex)) : 1;
  const existing = input.toTrackId
    ? input.document.timeline.tracks.find((track) => track.id === input.toTrackId)
    : !input.newTrack
      ? input.document.timeline.tracks.find((track) => track.type === 'graphics' && track.stackOrder === stackOrder)
      : undefined;
  const target = insertTargetTrack(input.document, existing
    ? { toTrackId: existing.id }
    : input.newTrack
      ? { newTrack: input.newTrack }
      : { newTrack: { id: uniqueTrackId(input.document, stackOrder), stackOrder, name: `Graphics ${stackOrder}` } });
  if (!target.ok) return target;
  const { id, startSec, durationSec, trackIndex: _trackIndex, ...block } = input.block;
  const inserted = applyEditorCommand(target.document, {
    type: 'overlay.insert',
    trackId: target.trackId,
    clip: {
      id,
      kind: 'graphic',
      startFrame: secondsToTimelineFrames(startSec, target.document.canvas.fps),
      durationFrames: positiveDurationFrames(durationSec, target.document.canvas.fps),
      enabled: true,
      block,
      ...(input.asset ? { assetId: input.asset.id } : {}),
      anchor: { type: 'timeline' },
    },
    ...(input.asset ? { asset: input.asset } : {}),
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  return {
    ok: true,
    document: inserted.document,
    receipts: [...target.receipts, inserted.receipt],
    clipId: id,
    trackId: target.trackId,
    ...(input.asset ? { assetId: input.asset.id } : {}),
  };
}

/** Move an overlay to an existing or newly-created lane, retaining the empty source lane. */
export function moveOverlayDocumentClip(input: MoveOverlayDocumentClipInput): OverlayDocumentEditResult {
  const target = insertTargetTrack(input.document, input);
  if (!target.ok) return target;
  const moved = applyEditorCommand(target.document, {
    type: 'overlay.move',
    clipId: input.clipId,
    toTrackId: target.trackId,
  });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
  return { ok: true, document: moved.document, receipts: [...target.receipts, moved.receipt] };
}

/** Duplicate an overlay to an existing or newly-created lane as one publish transaction. */
export function duplicateOverlayDocumentClip(input: DuplicateOverlayDocumentClipInput): OverlayDocumentEditResult {
  if (!Number.isFinite(input.startSec) || input.startSec < 0) {
    return failure(input.document, 'invalid-range', 'Duplicate startSec must be a non-negative finite number.', { path: 'startSec' });
  }
  const target = insertTargetTrack(input.document, input);
  if (!target.ok) return target;
  const duplicated = applyEditorCommand(target.document, {
    type: 'overlay.duplicate',
    clipId: input.clipId,
    newClipId: input.newClipId,
    startFrame: secondsToTimelineFrames(input.startSec, input.document.canvas.fps),
    toTrackId: target.trackId,
  });
  if (!duplicated.ok) return { ok: false, document: input.document, error: duplicated.error };
  return { ok: true, document: duplicated.document, receipts: [...target.receipts, duplicated.receipt] };
}

/** Reassign existing graphics stack values to a requested top-to-bottom lane order. */
export function reorderOverlayDocumentTracks(
  document: EditorDocumentV2,
  topToBottomTrackIds: readonly string[],
): OverlayDocumentEditResult {
  const graphics = document.timeline.tracks.filter((track) => track.type === 'graphics');
  const ids = [...new Set(topToBottomTrackIds)];
  if (ids.length !== topToBottomTrackIds.length || ids.length !== graphics.length) {
    return failure(document, 'invalid-command', 'Overlay reorder must contain every graphics lane exactly once.', { path: 'topToBottomTrackIds' });
  }
  const byId = new Map(graphics.map((track) => [track.id, track] as const));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) return failure(document, 'track-not-found', `Graphics track does not exist: ${missing.join(', ')}`, { trackIds: missing });
  const stackOrders = graphics.map((track) => track.stackOrder).sort((left, right) => right - left);
  const changed = ids.filter((id, index) => byId.get(id)!.stackOrder !== stackOrders[index]);
  const locked = changed.filter((id) => byId.get(id)!.locked);
  if (locked.length) return failure(document, 'track-locked', `Overlay reorder touches locked track(s): ${locked.join(', ')}`, { trackIds: locked });

  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [index, id] of ids.entries()) {
    if (byId.get(id)!.stackOrder === stackOrders[index]) continue;
    const patched = applyEditorCommand(next, { type: 'track.patch', trackId: id, patch: { stackOrder: stackOrders[index]! } });
    if (!patched.ok) return { ok: false, document, error: patched.error };
    next = patched.document;
    receipts.push(patched.receipt);
  }
  return { ok: true, document: next, receipts };
}
