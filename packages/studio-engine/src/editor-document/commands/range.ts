import type { EditorDocumentV2, EditorTrack } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { pruneEmptyNonPrimaryTracks } from '../prune-empty-tracks';
import { clearRangeFromClip, clipOverlapsRange } from './clip-geometry';
import { detachDanglingClipAnchors, updateScenesForClipChanges } from './clip-references';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';
import { directorPlanAfterRippleRemoval, withAdjustedDirectorPlan } from '../../director-plan-timing';

export interface RemoveEditorRangeOptions {
  trackId: string;
  startFrame: number;
  endFrame: number;
  mode: 'lift' | 'ripple';
  includeLinked?: boolean;
  pruneEmptyTracks?: boolean;
}

function trackNeedsRangeEdit(track: EditorTrack, startFrame: number, endFrame: number, ripple: boolean): boolean {
  return track.clips.some((clip) =>
    clipOverlapsRange(clip, startFrame, endFrame) || (ripple && clip.startFrame >= endFrame),
  );
}

function linkedClearTrackIds(
  document: EditorDocumentV2,
  initialTrackIds: Set<string>,
  startFrame: number,
  endFrame: number,
): Set<string> {
  const trackIds = new Set(initialTrackIds);
  const linkGroupIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const track of document.timeline.tracks) {
      if (!trackIds.has(track.id)) continue;
      for (const clip of track.clips) {
        if (clip.linkGroupId && clipOverlapsRange(clip, startFrame, endFrame) && !linkGroupIds.has(clip.linkGroupId)) {
          linkGroupIds.add(clip.linkGroupId);
          changed = true;
        }
      }
    }
    for (const track of document.timeline.tracks) {
      if (trackIds.has(track.id)) continue;
      if (track.clips.some((clip) => clip.linkGroupId && linkGroupIds.has(clip.linkGroupId))) {
        trackIds.add(track.id);
        changed = true;
      }
    }
  }
  return trackIds;
}

/**
 * Removes a frame range atomically. Lift leaves timeline positions intact. Ripple clears
 * the same interval on the anchor and sync-locked lanes, then closes the gap everywhere.
 */
export function removeEditorRange(document: EditorDocumentV2, options: RemoveEditorRangeOptions): EditorCommandResult {
  const { trackId, startFrame, endFrame, mode } = options;
  const inputIssue = validateEditorDocumentV2(document).find((issue) => issue.severity === 'error');
  if (inputIssue) return commandFailure(document, 'invalid-document', inputIssue.message, { path: inputIssue.path });
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame <= startFrame) {
    return commandFailure(document, 'invalid-range', 'Range must use integral frames with 0 <= start < end.', { path: 'range' });
  }
  const anchorTrack = document.timeline.tracks.find((track) => track.id === trackId);
  if (!anchorTrack) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });

  let clearTrackIds = new Set<string>([trackId]);
  if (mode === 'ripple') {
    for (const track of document.timeline.tracks) if (track.syncLocked) clearTrackIds.add(track.id);
  }
  if (options.includeLinked ?? true) {
    clearTrackIds = linkedClearTrackIds(document, clearTrackIds, startFrame, endFrame);
  }

  const tracksToChange = document.timeline.tracks.filter((track) =>
    clearTrackIds.has(track.id) && trackNeedsRangeEdit(track, startFrame, endFrame, mode === 'ripple'),
  );
  const lockedTrackIds = tracksToChange.filter((track) => track.locked).map((track) => track.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Range edit touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }
  if (!tracksToChange.length) {
    return { ok: true, document, receipt: emptyCommandReceipt('range.remove') };
  }

  const usedIds = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const removedClipIds = new Set<string>();
  const createdClipIds: string[] = [];
  const shiftedClipIds: string[] = [];
  const splitPairs = new Map<string, string[]>();
  const changedTrackIds = new Set<string>();
  const gapFrames = endFrame - startFrame;
  let tracks = document.timeline.tracks.map((track): EditorTrack => {
    if (!clearTrackIds.has(track.id) || !trackNeedsRangeEdit(track, startFrame, endFrame, mode === 'ripple')) return track;
    changedTrackIds.add(track.id);
    const clips = track.clips.flatMap((clip) => {
      const edit = clearRangeFromClip(clip, startFrame, endFrame, document.canvas.fps, usedIds);
      for (const id of edit.removedClipIds) removedClipIds.add(id);
      createdClipIds.push(...edit.createdClipIds);
      for (const [originalId, rightId] of edit.splitPairs) {
        splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
      }
      return edit.clips;
    }).map((clip) => {
      if (mode !== 'ripple' || clip.startFrame < endFrame) return clip;
      shiftedClipIds.push(clip.id);
      return { ...clip, startFrame: clip.startFrame - gapFrames };
    });
    return { ...track, clips };
  });

  const survivingClipIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const detached = detachDanglingClipAnchors(tracks, survivingClipIds);
  if (detached.lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Removing the range would detach anchors on locked track(s): ${detached.lockedTrackIds.join(', ')}`, { trackIds: detached.lockedTrackIds });
  }
  tracks = detached.tracks;
  for (const id of detached.changedTrackIds) changedTrackIds.add(id);

  let semantics: EditorDocumentV2['semantics'] = {
    ...document.semantics,
    scenes: updateScenesForClipChanges(document.semantics.scenes, removedClipIds, splitPairs),
  };
  if (mode === 'ripple' && document.semantics.directorPlan) {
    semantics = withAdjustedDirectorPlan(
      semantics,
      directorPlanAfterRippleRemoval(document.semantics.directorPlan, startFrame, endFrame),
    );
  }
  if (semantics.managedCaptionSource?.mode === 'clip' && removedClipIds.has(semantics.managedCaptionSource.clipId)) {
    semantics = { ...semantics, managedCaptionSource: { mode: 'auto' } };
  }
  const editedDocument = { ...document, timeline: { ...document.timeline, tracks }, semantics };
  // Overwrite insertion clears the destination interval and then immediately places replacement
  // clips back on the same lane. Keep that lane alive across the two halves of the transaction;
  // otherwise a fully-covered non-primary track is pruned here and the insertion has no target.
  const pruned = options.pruneEmptyTracks === false
    ? { document: editedDocument, removedTrackIds: [] }
    : pruneEmptyNonPrimaryTracks(
        editedDocument,
        { preserveManagedCaptions: options.pruneEmptyTracks !== true },
      );
  let next = pruned.document;
  if (next.semantics.managedCaptionSource?.mode === 'track' && pruned.removedTrackIds.includes(next.semantics.managedCaptionSource.trackId)) {
    next = { ...next, semantics: { ...next.semantics, managedCaptionSource: { mode: 'auto' } } };
  }
  const outputIssue = validateEditorDocumentV2(next).find((issue) => issue.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });

  const receipt = emptyCommandReceipt('range.remove');
  receipt.affectedTrackIds = [...new Set([...changedTrackIds, ...pruned.removedTrackIds])];
  receipt.removedTrackIds = pruned.removedTrackIds;
  receipt.removedClipIds = [...removedClipIds];
  receipt.createdClipIds = createdClipIds;
  receipt.shiftedClipIds = shiftedClipIds;
  if (mode === 'ripple') receipt.removedFrames = gapFrames;
  return { ok: true, document: next, receipt };
}
