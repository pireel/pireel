import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

type OverlayClip = Extract<TimelineClip, { kind: 'graphic' | 'caption' }>;

function overlayClip(clip: TimelineClip): clip is OverlayClip {
  return clip.kind === 'graphic' || clip.kind === 'caption';
}

function duplicateSlots(clip: OverlayClip, newClipId: string): OverlayClip['block']['slots'] {
  return Object.fromEntries(Object.entries(clip.block.slots).map(([key, value]) => [
    key,
    typeof value === 'string'
      ? value
          .replaceAll(`#${clip.id}`, `#${newClipId}`)
          .replaceAll(`"${clip.id}"`, `"${newClipId}"`)
          .replaceAll(`'${clip.id}'`, `'${newClipId}'`)
      : value,
  ]));
}

/** Duplicate an overlay onto a compatible target lane without changing the source clip. */
export function duplicateOverlayClip(
  document: EditorDocumentV2,
  clipId: string,
  newClipId: string,
  startFrame: number,
  toTrackId?: string,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!newClipId.trim()) return commandFailure(document, 'invalid-command', 'New clip id must not be empty.', { path: 'newClipId' });
  if (document.timeline.tracks.some((track) => track.clips.some((clip) => clip.id === newClipId))) {
    return commandFailure(document, 'duplicate-clip-id', `Clip already exists: ${newClipId}`, { path: 'newClipId' });
  }
  if (!Number.isInteger(startFrame) || startFrame < 0) {
    return commandFailure(document, 'invalid-range', 'Duplicate startFrame must be a non-negative integer.', { path: 'startFrame' });
  }
  const source = document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
  if (!source) return commandFailure(document, 'clip-not-found', `Clip does not exist: ${clipId}`, { path: 'clipId' });
  const clip = source.clips.find((candidate) => candidate.id === clipId)!;
  if (!overlayClip(clip)) {
    return commandFailure(document, 'invalid-command', `Clip is not an overlay: ${clipId}`, { path: 'clipId', trackIds: [source.id] });
  }
  const targetId = toTrackId ?? source.id;
  const target = document.timeline.tracks.find((track) => track.id === targetId);
  if (!target) return commandFailure(document, 'track-not-found', `Track does not exist: ${targetId}`, { trackIds: [targetId] });
  const compatible = clip.kind === 'graphic'
    ? target.type === 'graphics'
    : target.type === 'caption' && (!clip.managed || target.role === 'managedCaptions');
  if (!compatible) {
    return commandFailure(document, 'invalid-command', `${clip.kind} clip ${clipId} cannot duplicate to ${target.type} track ${targetId}.`, { path: 'toTrackId', trackIds: [targetId] });
  }
  if (target.locked) return commandFailure(document, 'track-locked', `Track is locked: ${targetId}`, { trackIds: [targetId] });

  const duplicate: OverlayClip = {
    ...clip,
    id: newClipId,
    startFrame,
    // Custom blocks scope their HTML/CSS/GSAP to the clip id. Keeping the old selector makes the
    // duplicate look blank or control its source; re-key every string slot with the new identity.
    block: { ...clip.block, slots: duplicateSlots(clip, newClipId) },
    anchor: { ...clip.anchor },
    ...(clip.kind === 'caption' && clip.sourceRef ? { sourceRef: { ...clip.sourceRef } } : {}),
  };
  const tracks = document.timeline.tracks.map((track): EditorTrack => (
    track.id === targetId ? { ...track, clips: [...track.clips, duplicate] } : track
  ));
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks } };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('overlay.duplicate');
  receipt.affectedTrackIds = [targetId];
  receipt.createdClipIds = [newClipId];
  return { ok: true, document: next, receipt };
}
