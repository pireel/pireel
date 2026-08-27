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
import { applyOverlayDocumentEdits, type OverlayDocumentEditResult } from './overlay-document-edit';
import { assignClipToBestDirectorScene, assignClipToSemanticScene } from './semantic-scenes';

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
  /** Optional final timeline position. Track and time then commit as one publish transaction. */
  startSec?: number;
}

export interface RetimeOverlayDocumentClipInput {
  document: EditorDocumentV2;
  clipId: string;
  startSec?: number;
  durationSec?: number;
  /** Agent timing edits default to lane compaction; direct canvas gestures keep using the lower-level APIs. */
  compact?: boolean;
}

export interface DuplicateOverlayDocumentClipInput extends OverlayTrackTarget {
  document: EditorDocumentV2;
  clipId: string;
  newClipId: string;
  startSec: number;
  /** Explicit Director scene; otherwise inferred from the duplicate's new placement. */
  sceneId?: string;
}

export interface InsertOverlayDocumentClipInput extends Partial<OverlayTrackTarget> {
  document: EditorDocumentV2;
  block: Block;
  asset?: EditorMediaAsset;
  /** Explicit Director Plan scene; absent placements are inferred by maximum timeline overlap. */
  sceneId?: string;
}

export type InsertOverlayDocumentClipResult = OverlayDocumentEditResult & {
  clipId?: string;
  trackId?: string;
  assetId?: string;
  sceneId?: string;
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
  if (target.toTrackId) {
    const track = document.timeline.tracks.find((candidate) => candidate.id === target.toTrackId);
    if (!track) {
      return failure(document, 'track-not-found', `Track does not exist: ${target.toTrackId}`, { trackIds: [target.toTrackId] });
    }
    if (track.type !== 'graphics') {
      return failure(document, 'invalid-track-role', 'Motion Graphics can only be placed on a graphics track.', {
        path: 'toTrackId',
        trackIds: [target.toTrackId],
      });
    }
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

/** NLE-style lane placement: a physical track is sequential. Placing a visual clip into an
 * occupied interval trims/splits/removes the blockers before the new clip lands. */
function clearOverlayDestination(
  document: EditorDocumentV2,
  trackId: string,
  startFrame: number,
  durationFrames: number,
): { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] } | OverlayDocumentEditFailure {
  const cleared = applyEditorCommand(document, {
    type: 'range.remove',
    trackId,
    startFrame,
    endFrame: startFrame + durationFrames,
    mode: 'lift',
    includeLinked: false,
    pruneEmptyTracks: false,
  });
  if (!cleared.ok) return { ok: false, document, error: cleared.error };
  return {
    ok: true,
    document: cleared.document,
    receipts: cleared.document === document ? [] : [cleared.receipt],
  };
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
      ? input.document.timeline.tracks.find((track) =>
          track.type === 'graphics' && track.stackOrder === stackOrder)
      : undefined;
  const target = insertTargetTrack(input.document, existing
    ? { toTrackId: existing.id }
    : input.newTrack
      ? { newTrack: input.newTrack }
      : { newTrack: { id: uniqueTrackId(input.document, stackOrder), stackOrder, name: `Graphics ${stackOrder}` } });
  if (!target.ok) return target;
  const { id, startSec, durationSec, trackIndex: _trackIndex, ...block } = input.block;
  const startFrame = secondsToTimelineFrames(startSec, target.document.canvas.fps);
  const durationFrames = positiveDurationFrames(durationSec, target.document.canvas.fps);
  const cleared = clearOverlayDestination(target.document, target.trackId, startFrame, durationFrames);
  if (!cleared.ok) return { ok: false, document: input.document, error: cleared.error };
  const inserted = applyEditorCommand(cleared.document, {
    type: 'overlay.insert',
    trackId: target.trackId,
    clip: {
      id,
      kind: 'graphic',
      startFrame,
      durationFrames,
      enabled: true,
      block,
      ...(input.asset ? { assetId: input.asset.id } : {}),
      anchor: { type: 'timeline' },
    },
    ...(input.asset ? { asset: input.asset } : {}),
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const assigned = input.sceneId
    ? assignClipToSemanticScene(inserted.document, id, input.sceneId)
    : assignClipToBestDirectorScene(inserted.document, id);
  if (!assigned.ok) return failure(input.document, 'invalid-command', assigned.error, { path: 'sceneId' });
  return {
    ok: true,
    document: assigned.document,
    receipts: [...target.receipts, ...cleared.receipts, inserted.receipt],
    clipId: id,
    trackId: target.trackId,
    ...(assigned.sceneId ? { sceneId: assigned.sceneId } : {}),
    ...(input.asset ? { assetId: input.asset.id } : {}),
  };
}

/** Move an overlay to an existing or newly-created lane; an emptied source lane is pruned. */
export function moveOverlayDocumentClip(input: MoveOverlayDocumentClipInput): OverlayDocumentEditResult {
  if (input.startSec != null && (!Number.isFinite(input.startSec) || input.startSec < 0)) {
    return failure(input.document, 'invalid-range', 'Overlay move startSec must be a non-negative finite number.', { path: 'startSec' });
  }
  const sourceTrack = input.document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === input.clipId));
  const sourceClip = sourceTrack?.clips.find((clip) => clip.id === input.clipId);
  if (!sourceTrack || !sourceClip || (sourceClip.kind !== 'graphic' && sourceClip.kind !== 'caption')) {
    return failure(input.document, 'clip-not-found', `Overlay clip does not exist: ${input.clipId}`, { path: 'clipId' });
  }
  const target = insertTargetTrack(input.document, input);
  if (!target.ok) return target;
  const desiredStartFrame = input.startSec == null
    ? sourceClip.startFrame
    : secondsToTimelineFrames(input.startSec, target.document.canvas.fps);
  const timingChanged = desiredStartFrame !== sourceClip.startFrame;
  if (sourceTrack.id === target.trackId) {
    if (!timingChanged) return { ok: true, document: input.document, receipts: [] };
    return applyOverlayDocumentEdits({
      document: input.document,
      updates: [{ clipId: input.clipId, startSec: input.startSec! }],
    });
  }
  // When time also changes, move the stable identity first and let the timing transaction clear
  // only the final destination range. Clearing the old range would destroy unrelated material the
  // pointer merely passed over during the gesture.
  if (timingChanged) {
    const moved = applyEditorCommand(target.document, {
      type: 'overlay.move',
      clipId: input.clipId,
      toTrackId: target.trackId,
    });
    if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
    const timed = applyOverlayDocumentEdits({
      document: moved.document,
      updates: [{ clipId: input.clipId, startSec: input.startSec! }],
    });
    if (!timed.ok) return { ok: false, document: input.document, error: timed.error };
    return { ok: true, document: timed.document, receipts: [...target.receipts, moved.receipt, ...timed.receipts] };
  }
  const cleared = clearOverlayDestination(
    target.document,
    target.trackId,
    sourceClip.startFrame,
    sourceClip.durationFrames,
  );
  if (!cleared.ok) return { ok: false, document: input.document, error: cleared.error };
  const moved = applyEditorCommand(cleared.document, {
    type: 'overlay.move',
    clipId: input.clipId,
    toTrackId: target.trackId,
  });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
  return { ok: true, document: moved.document, receipts: [...target.receipts, ...cleared.receipts, moved.receipt] };
}

/** Retime an overlay and then move it to the lowest existing free graphics lane. This is deliberately
 * opt-in at the command surface: agent-authored timing repairs should not leave sparse track towers,
 * while a user's direct vertical track drag remains an explicit layer choice. */
export function retimeOverlayDocumentClip(input: RetimeOverlayDocumentClipInput): OverlayDocumentEditResult {
  const edited = applyOverlayDocumentEdits({
    document: input.document,
    updates: [{
      clipId: input.clipId,
      ...(input.startSec != null ? { startSec: input.startSec } : {}),
      ...(input.durationSec != null ? { durationSec: input.durationSec } : {}),
    }],
  });
  if (!edited.ok || input.compact === false) return edited;

  const sourceTrack = edited.document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === input.clipId));
  const sourceClip = sourceTrack?.clips.find((clip) => clip.id === input.clipId);
  if (!sourceTrack || !sourceClip || sourceClip.kind !== 'graphic' || sourceTrack.type !== 'graphics') return edited;
  const start = sourceClip.startFrame;
  const end = start + sourceClip.durationFrames;
  const target = edited.document.timeline.tracks
    .filter((track) => track.type === 'graphics' && !track.locked && track.stackOrder >= 2 && track.stackOrder < sourceTrack.stackOrder)
    .sort((left, right) => left.stackOrder - right.stackOrder)
    .find((track) => !track.clips.some((clip) => clip.id !== input.clipId
      && clip.startFrame < end && clip.startFrame + clip.durationFrames > start));
  if (!target) return edited;

  const moved = moveOverlayDocumentClip({ document: edited.document, clipId: input.clipId, toTrackId: target.id });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
  return { ok: true, document: moved.document, receipts: [...edited.receipts, ...moved.receipts] };
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
  const assigned = input.sceneId
    ? assignClipToSemanticScene(duplicated.document, input.newClipId, input.sceneId)
    : assignClipToBestDirectorScene(duplicated.document, input.newClipId);
  if (!assigned.ok) return failure(input.document, 'invalid-command', assigned.error, { path: 'sceneId' });
  return { ok: true, document: assigned.document, receipts: [...target.receipts, duplicated.receipt] };
}

/** Reassign existing graphics stack values to a requested top-to-bottom lane order. */
export function reorderOverlayDocumentTracks(
  document: EditorDocumentV2,
  topToBottomTrackIds: readonly string[],
): OverlayDocumentEditResult {
  const graphics = document.timeline.tracks.filter((track) =>
    track.type !== 'audio' && track.role !== 'primaryNarrative');
  const ids = [...new Set(topToBottomTrackIds)];
  if (ids.length !== topToBottomTrackIds.length || ids.length !== graphics.length) {
    return failure(document, 'invalid-command', 'Visual reorder must contain every non-primary visual lane exactly once.', { path: 'topToBottomTrackIds' });
  }
  const byId = new Map(graphics.map((track) => [track.id, track] as const));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) return failure(document, 'track-not-found', `Visual track does not exist: ${missing.join(', ')}`, { trackIds: missing });
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
