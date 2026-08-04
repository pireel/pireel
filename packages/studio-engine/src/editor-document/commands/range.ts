import type { EditorDocumentV2, EditorTrack, SemanticScene, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { clearRangeFromClip, clipEndFrame, clipOverlapsRange } from './clip-geometry';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

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

function updateScenes(
  scenes: SemanticScene[],
  removedIds: Set<string>,
  splitPairs: Map<string, string[]>,
): SemanticScene[] {
  let changed = false;
  const next = scenes.map((scene) => {
    const clipIds = scene.clipIds.flatMap((id) => {
      if (removedIds.has(id)) {
        changed = true;
        return [];
      }
      const splitIds = splitPairs.get(id);
      if (!splitIds?.length) return [id];
      changed = true;
      return [id, ...splitIds];
    });
    return clipIds === scene.clipIds ? scene : { ...scene, clipIds };
  });
  return changed ? next : scenes;
}

function detachDanglingClipAnchors(
  tracks: EditorTrack[],
  survivingClipIds: Set<string>,
): { tracks: EditorTrack[]; changedTrackIds: string[]; lockedTrackIds: string[] } {
  const changedTrackIds: string[] = [];
  const lockedTrackIds: string[] = [];
  const nextTracks = tracks.map((track) => {
    const hasDanglingAnchor = track.clips.some((clip) =>
      'anchor' in clip && clip.anchor.type === 'clip' && !survivingClipIds.has(clip.anchor.clipId),
    );
    if (!hasDanglingAnchor) return track;
    if (track.locked) {
      lockedTrackIds.push(track.id);
      return track;
    }
    changedTrackIds.push(track.id);
    return {
      ...track,
      clips: track.clips.map((clip): TimelineClip => {
        if (!('anchor' in clip) || clip.anchor.type !== 'clip' || survivingClipIds.has(clip.anchor.clipId)) return clip;
        return { ...clip, anchor: { type: 'timeline' } };
      }),
    };
  });
  return { tracks: nextTracks, changedTrackIds, lockedTrackIds };
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

  const removedTrackIds: string[] = [];
  let managedCaptionTrackRemoved = false;
  if (options.pruneEmptyTracks) {
    tracks = tracks.filter((track) => {
      const shouldPrune = changedTrackIds.has(track.id)
        && track.clips.length === 0
        && track.id !== document.semantics.primaryNarrativeTrackId;
      if (!shouldPrune) return true;
      removedTrackIds.push(track.id);
      if (track.id === document.semantics.managedCaptionTrackId) managedCaptionTrackRemoved = true;
      return false;
    });
  }

  let semantics = {
    ...document.semantics,
    scenes: updateScenes(document.semantics.scenes, removedClipIds, splitPairs),
  };
  if (managedCaptionTrackRemoved) {
    const { managedCaptionTrackId: _removed, ...withoutManagedCaptionTrack } = semantics;
    semantics = withoutManagedCaptionTrack;
  }
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks }, semantics };
  const outputIssue = validateEditorDocumentV2(next).find((issue) => issue.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });

  const receipt = emptyCommandReceipt('range.remove');
  receipt.affectedTrackIds = [...changedTrackIds];
  receipt.removedTrackIds = removedTrackIds;
  receipt.removedClipIds = [...removedClipIds];
  receipt.createdClipIds = createdClipIds;
  receipt.shiftedClipIds = shiftedClipIds;
  if (mode === 'ripple') receipt.removedFrames = gapFrames;
  return { ok: true, document: next, receipt };
}
