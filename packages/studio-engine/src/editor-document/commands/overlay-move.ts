import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

type OverlayClip = Extract<TimelineClip, { kind: 'graphic' | 'caption' }>;

function overlayClip(clip: TimelineClip): clip is OverlayClip {
  return clip.kind === 'graphic' || clip.kind === 'caption';
}

function acceptsOverlay(track: EditorTrack, clip: OverlayClip): boolean {
  if (clip.kind === 'graphic') return track.type === 'graphics';
  return track.type === 'caption' && (!clip.managed || track.role === 'managedCaptions');
}

/** Move one overlay identity between compatible lanes, retaining timing, payload and anchors. */
export function moveOverlayClip(
  document: EditorDocumentV2,
  clipId: string,
  toTrackId: string,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const source = document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
  if (!source) return commandFailure(document, 'clip-not-found', `Clip does not exist: ${clipId}`, { path: 'clipId' });
  const clip = source.clips.find((candidate) => candidate.id === clipId)!;
  if (!overlayClip(clip)) {
    return commandFailure(document, 'invalid-command', `Clip is not an overlay: ${clipId}`, { path: 'clipId', trackIds: [source.id] });
  }
  const target = document.timeline.tracks.find((track) => track.id === toTrackId);
  if (!target) return commandFailure(document, 'track-not-found', `Track does not exist: ${toTrackId}`, { trackIds: [toTrackId] });
  if (!acceptsOverlay(target, clip)) {
    return commandFailure(document, 'invalid-command', `${clip.kind} clip ${clipId} cannot move to ${target.type} track ${toTrackId}.`, { path: 'toTrackId', trackIds: [toTrackId] });
  }
  const lockedTrackIds = [...new Set([source, target].filter((track) => track.locked).map((track) => track.id))];
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Overlay move touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }
  if (source.id === target.id) return { ok: true, document, receipt: emptyCommandReceipt('overlay.move') };

  const tracks = document.timeline.tracks.map((track): EditorTrack => {
    if (track.id === source.id) return { ...track, clips: track.clips.filter((candidate) => candidate.id !== clipId) };
    if (track.id === target.id) return { ...track, clips: [...track.clips, clip] };
    return track;
  });
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks } };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('overlay.move');
  receipt.affectedTrackIds = [source.id, target.id];
  return { ok: true, document: next, receipt };
}
