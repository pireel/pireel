import type { EditorDocumentV2, EditorTrack, NarrativeTimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

/** Reorder every clip on the primary lane while preserving its explicit leading/inter-clip gaps. */
export function reorderNarrativeClips(document: EditorDocumentV2, clipIds: readonly string[]): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const track = document.timeline.tracks.find((candidate) => candidate.id === document.semantics.primaryNarrativeTrackId);
  if (!track) return commandFailure(document, 'track-not-found', 'Primary narrative track does not exist.', { trackIds: [document.semantics.primaryNarrativeTrackId] });
  const narrative = [...track.clips].filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative').sort((a, b) => a.startFrame - b.startFrame);
  if (narrative.length !== track.clips.length) {
    return commandFailure(document, 'invalid-command', 'Primary narrative track contains a non-narrative clip.', { trackIds: [track.id] });
  }
  const ids = [...clipIds];
  if (new Set(ids).size !== ids.length || ids.length !== narrative.length) {
    return commandFailure(document, 'invalid-command', 'Narrative reorder must contain every primary clip exactly once.', { path: 'clipIds' });
  }
  const byId = new Map(narrative.map((clip) => [clip.id, clip] as const));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) return commandFailure(document, 'clip-not-found', `Narrative clip does not exist: ${missing.join(', ')}`, { path: 'clipIds', trackIds: [track.id] });
  if (ids.every((id, index) => id === narrative[index]?.id)) return { ok: true, document, receipt: emptyCommandReceipt('narrative.reorder') };
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${track.id}`, { trackIds: [track.id] });

  const gapsAfter = narrative.map((clip, index) => {
    const next = narrative[index + 1];
    return next ? Math.max(0, next.startFrame - (clip.startFrame + clip.durationFrames)) : 0;
  });
  let cursor = narrative[0]?.startFrame ?? 0;
  const clips = ids.map((id, index) => {
    const clip = byId.get(id)!;
    const next = clip.startFrame === cursor ? clip : { ...clip, startFrame: cursor };
    cursor += clip.durationFrames + gapsAfter[index]!;
    return next;
  });
  const tracks = document.timeline.tracks.map((candidate): EditorTrack => candidate.id === track.id ? { ...candidate, clips } : candidate);
  const semantics = { ...document.semantics };
  delete semantics.plan;
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks }, semantics };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('narrative.reorder');
  receipt.affectedTrackIds = [track.id];
  receipt.shiftedClipIds = clips.filter((clip) => clip.startFrame !== byId.get(clip.id)!.startFrame).map((clip) => clip.id);
  return { ok: true, document: next, receipt };
}
