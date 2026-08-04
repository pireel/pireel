import type { EditorDocumentV2, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type ClipPatch, type EditorCommandResult } from './types';

/** Patch non-geometric clip state. Geometry continues to belong to range/insert/split commands. */
export function patchEditorClip(
  document: EditorDocumentV2,
  trackId: string,
  clipId: string,
  patch: ClipPatch,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const trackIndex = document.timeline.tracks.findIndex((track) => track.id === trackId);
  if (trackIndex < 0) {
    return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  }
  const track = document.timeline.tracks[trackIndex]!;
  if (track.locked) {
    return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });
  }
  const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
  if (clipIndex < 0) {
    return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${trackId}: ${clipId}`, { trackIds: [trackId] });
  }
  const current = track.clips[clipIndex]!;
  const nextClip: TimelineClip = { ...current, ...patch };
  if (current.enabled === nextClip.enabled) {
    return { ok: true, document, receipt: emptyCommandReceipt('clip.patch') };
  }

  const clips = [...track.clips];
  clips[clipIndex] = nextClip;
  const tracks = [...document.timeline.tracks];
  tracks[trackIndex] = { ...track, clips };
  const receipt = emptyCommandReceipt('clip.patch');
  receipt.affectedTrackIds = [trackId];
  return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } }, receipt };
}
