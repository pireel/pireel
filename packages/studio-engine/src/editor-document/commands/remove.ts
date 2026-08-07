import type { EditorDocumentV2, EditorTrack } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { pruneEmptyNonPrimaryTracks } from '../prune-empty-tracks';
import { detachDanglingClipAnchors, updateScenesForClipChanges } from './clip-references';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

export interface RemoveEditorClipsOptions {
  trackId: string;
  clipIds: string[];
  includeLinked?: boolean;
}

/** Remove exact clip identities without shifting any surviving timeline placement. */
export function removeEditorClips(
  document: EditorDocumentV2,
  options: RemoveEditorClipsOptions,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const track = document.timeline.tracks.find((candidate) => candidate.id === options.trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${options.trackId}`, { trackIds: [options.trackId] });
  const requestedIds = [...new Set(options.clipIds)];
  // Batch removal is intentionally idempotent. Asset deletion can legitimately reach this command
  // after its last timeline reference has already gone; an empty batch means there is nothing left
  // to detach, not that the delete operation failed.
  if (!requestedIds.length) return { ok: true, document, receipt: emptyCommandReceipt('clips.remove') };
  const missingIds = requestedIds.filter((id) => !track.clips.some((clip) => clip.id === id));
  if (missingIds.length) {
    return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${options.trackId}: ${missingIds.join(', ')}`, { path: 'clipIds', trackIds: [options.trackId] });
  }

  const removedIds = new Set(requestedIds);
  if (options.includeLinked ?? true) {
    const linkedGroups = new Set(track.clips
      .filter((clip) => removedIds.has(clip.id) && clip.linkGroupId)
      .map((clip) => clip.linkGroupId!));
    if (linkedGroups.size) {
      for (const candidate of document.timeline.tracks) {
        for (const clip of candidate.clips) if (clip.linkGroupId && linkedGroups.has(clip.linkGroupId)) removedIds.add(clip.id);
      }
    }
  }

  const touchedTracks = document.timeline.tracks.filter((candidate) => candidate.clips.some((clip) => removedIds.has(clip.id)));
  const lockedTrackIds = touchedTracks.filter((candidate) => candidate.locked).map((candidate) => candidate.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Clip removal touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }
  let tracks: EditorTrack[] = document.timeline.tracks.map((candidate) => {
    if (!candidate.clips.some((clip) => removedIds.has(clip.id))) return candidate;
    return { ...candidate, clips: candidate.clips.filter((clip) => !removedIds.has(clip.id)) };
  });
  const survivingIds = new Set(tracks.flatMap((candidate) => candidate.clips.map((clip) => clip.id)));
  const detached = detachDanglingClipAnchors(tracks, survivingIds);
  if (detached.lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Removing clips would detach anchors on locked track(s): ${detached.lockedTrackIds.join(', ')}`, { trackIds: detached.lockedTrackIds });
  }
  tracks = detached.tracks;
  const affectedTrackIds = new Set([...touchedTracks.map((candidate) => candidate.id), ...detached.changedTrackIds]);
  let next: EditorDocumentV2 = {
    ...document,
    timeline: { ...document.timeline, tracks },
    semantics: {
      ...document.semantics,
      scenes: updateScenesForClipChanges(document.semantics.scenes, removedIds),
    },
  };
  const pruned = pruneEmptyNonPrimaryTracks(next);
  next = pruned.document;
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('clips.remove');
  receipt.affectedTrackIds = [...new Set([...affectedTrackIds, ...pruned.removedTrackIds])];
  receipt.removedTrackIds = pruned.removedTrackIds;
  receipt.removedClipIds = [...removedIds];
  return { ok: true, document: next, receipt };
}
