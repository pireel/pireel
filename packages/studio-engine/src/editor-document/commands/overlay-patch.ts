import type { EditorDocumentV2, EditorTrack, GraphicBlockPayload, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { clearRangeFromClip } from './clip-geometry';
import { detachDanglingClipAnchors, updateScenesForClipChanges } from './clip-references';
import {
  commandFailure,
  emptyCommandReceipt,
  type EditorCommandResult,
  type OverlayClipPatchUpdate,
} from './types';

function isOverlayClip(clip: TimelineClip): clip is Extract<TimelineClip, { kind: 'graphic' | 'caption' }> {
  return clip.kind === 'graphic' || clip.kind === 'caption';
}

function invalidPatch(update: OverlayClipPatchUpdate): string | null {
  const { patch } = update;
  if (patch.startFrame == null && patch.durationFrames == null && patch.block == null) return 'Overlay patch is empty.';
  if (patch.startFrame != null && (!Number.isInteger(patch.startFrame) || patch.startFrame < 0)) {
    return 'Overlay startFrame must be a non-negative integer.';
  }
  if (patch.durationFrames != null && (!Number.isInteger(patch.durationFrames) || patch.durationFrames <= 0)) {
    return 'Overlay durationFrames must be a positive integer.';
  }
  if (patch.block != null && (typeof patch.block !== 'object' || Array.isArray(patch.block))) {
    return 'Overlay block patch must be an object.';
  }
  if (patch.block && 'templateId' in patch.block && typeof patch.block.templateId !== 'string') {
    return 'Overlay templateId must be a string.';
  }
  if (patch.block && 'slots' in patch.block && (!patch.block.slots || typeof patch.block.slots !== 'object' || Array.isArray(patch.block.slots))) {
    return 'Overlay slots must be an object.';
  }
  return null;
}

function patchBlockPayload(
  current: GraphicBlockPayload,
  patch: NonNullable<OverlayClipPatchUpdate['patch']['block']>,
): GraphicBlockPayload {
  const next = { ...current, ...patch };
  for (const key of Object.keys(patch) as (keyof GraphicBlockPayload)[]) {
    if (patch[key] === undefined) delete (next as Partial<GraphicBlockPayload>)[key];
  }
  return next;
}

/** Patch overlay timing/payload by stable clip id without flattening its track or anchor. */
export function patchOverlayClips(
  document: EditorDocumentV2,
  updates: readonly OverlayClipPatchUpdate[],
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!updates.length) return commandFailure(document, 'invalid-command', 'At least one overlay patch is required.', { path: 'updates' });

  const locations = new Map(document.timeline.tracks.flatMap((track) => (
    track.clips.map((clip) => [clip.id, { track, clip }] as const)
  )));
  const seen = new Set<string>();
  const nextById = new Map<string, TimelineClip>();
  const geometryIds = new Set<string>();
  const targetTrackIds = new Set<string>();
  const affectedTrackIds = new Set<string>();
  for (const [index, update] of updates.entries()) {
    if (seen.has(update.clipId)) {
      return commandFailure(document, 'invalid-command', `Overlay clip is targeted more than once: ${update.clipId}`, { path: `updates[${index}].clipId` });
    }
    seen.add(update.clipId);
    const found = locations.get(update.clipId);
    if (!found) return commandFailure(document, 'clip-not-found', `Clip does not exist: ${update.clipId}`, { path: `updates[${index}].clipId` });
    if (!isOverlayClip(found.clip)) {
      return commandFailure(document, 'invalid-command', `Clip is not an overlay: ${update.clipId}`, { path: `updates[${index}].clipId`, trackIds: [found.track.id] });
    }
    targetTrackIds.add(found.track.id);
    const patchError = invalidPatch(update);
    if (patchError) return commandFailure(document, 'invalid-command', patchError, { path: `updates[${index}].patch`, trackIds: [found.track.id] });
    const next = {
      ...found.clip,
      ...(update.patch.startFrame != null ? { startFrame: update.patch.startFrame } : {}),
      ...(update.patch.durationFrames != null ? { durationFrames: update.patch.durationFrames } : {}),
      ...(update.patch.block ? { block: patchBlockPayload(found.clip.block, update.patch.block) } : {}),
    };
    if (JSON.stringify(next) !== JSON.stringify(found.clip)) {
      nextById.set(update.clipId, next);
      affectedTrackIds.add(found.track.id);
      if (update.patch.startFrame != null || update.patch.durationFrames != null) geometryIds.add(update.clipId);
    }
  }
  const lockedTrackIds = document.timeline.tracks
    .filter((track) => targetTrackIds.has(track.id) && track.locked)
    .map((track) => track.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Overlay patch touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }
  if (!nextById.size) return { ok: true, document, receipt: emptyCommandReceipt('overlay.patch') };

  const usedIds = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const removedClipIds = new Set<string>();
  const createdClipIds: string[] = [];
  const splitPairs = new Map<string, string[]>();
  let tracks = document.timeline.tracks.map((track): EditorTrack => {
    if (!affectedTrackIds.has(track.id)) return track;
    const moving = track.clips
      .filter((clip) => geometryIds.has(clip.id))
      .map((clip) => nextById.get(clip.id) ?? clip);
    let stationary = track.clips
      .filter((clip) => !geometryIds.has(clip.id))
      .map((clip) => nextById.get(clip.id) ?? clip);
    for (const clip of moving) {
      const startFrame = clip.startFrame;
      const endFrame = startFrame + clip.durationFrames;
      stationary = stationary.flatMap((candidate) => {
        const edit = clearRangeFromClip(candidate, startFrame, endFrame, document.canvas.fps, usedIds);
        edit.removedClipIds.forEach((id) => removedClipIds.add(id));
        createdClipIds.push(...edit.createdClipIds);
        for (const [originalId, rightId] of edit.splitPairs) {
          splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
        }
        return edit.clips;
      });
    }
    return { ...track, clips: [...stationary, ...moving].sort((left, right) => left.startFrame - right.startFrame) };
  });
  const survivingClipIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const detached = detachDanglingClipAnchors(tracks, survivingClipIds);
  if (detached.lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Overlay timing would detach anchors on locked track(s): ${detached.lockedTrackIds.join(', ')}`, {
      trackIds: detached.lockedTrackIds,
    });
  }
  tracks = detached.tracks;
  const semantics = {
    ...document.semantics,
    scenes: updateScenesForClipChanges(document.semantics.scenes, removedClipIds, splitPairs),
    ...(document.semantics.managedCaptionSource?.mode === 'clip'
      && removedClipIds.has(document.semantics.managedCaptionSource.clipId)
      ? { managedCaptionSource: { mode: 'auto' as const } }
      : {}),
  };
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks }, semantics };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('overlay.patch');
  receipt.affectedTrackIds = [...new Set([...affectedTrackIds, ...detached.changedTrackIds])];
  receipt.removedClipIds = [...removedClipIds];
  receipt.createdClipIds = createdClipIds;
  return { ok: true, document: next, receipt };
}
