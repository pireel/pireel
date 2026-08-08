import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

function uniqueGroupId(document: EditorDocumentV2): string {
  const used = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.linkGroupId).filter(Boolean)));
  let suffix = 1;
  while (used.has(`link_${suffix}`)) suffix += 1;
  return `link_${suffix}`;
}

export function linkEditorClips(document: EditorDocumentV2, clipIds: readonly string[], groupId?: string): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const ids = [...new Set(clipIds)];
  if (ids.length < 2) return commandFailure(document, 'invalid-command', 'Linking requires at least two distinct clip ids.', { path: 'clipIds' });
  const located = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id] as const)));
  const missing = ids.filter((id) => !located.has(id));
  if (missing.length) return commandFailure(document, 'clip-not-found', `Clip(s) do not exist: ${missing.join(', ')}`, { path: 'clipIds' });
  const touched = new Set(ids.map((id) => located.get(id)!));
  const locked = document.timeline.tracks.filter((track) => touched.has(track.id) && track.locked).map((track) => track.id);
  if (locked.length) return commandFailure(document, 'track-locked', `Linking touches locked track(s): ${locked.join(', ')}`, { trackIds: locked });
  const linkGroupId = groupId?.trim() || uniqueGroupId(document);
  const tracks = document.timeline.tracks.map((track): EditorTrack => touched.has(track.id)
    ? { ...track, clips: track.clips.map((clip): TimelineClip => ids.includes(clip.id) ? { ...clip, linkGroupId } : clip) }
    : track);
  const receipt = emptyCommandReceipt('clips.link');
  receipt.affectedTrackIds = [...touched];
  return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } }, receipt };
}

export function unlinkEditorClips(document: EditorDocumentV2, clipIds: readonly string[]): EditorCommandResult {
  const ids = [...new Set(clipIds)];
  if (!ids.length) return commandFailure(document, 'invalid-command', 'Unlinking requires at least one clip id.', { path: 'clipIds' });
  const located = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id] as const)));
  const missing = ids.filter((id) => !located.has(id));
  if (missing.length) return commandFailure(document, 'clip-not-found', `Clip(s) do not exist: ${missing.join(', ')}`, { path: 'clipIds' });
  const touched = new Set(ids.map((id) => located.get(id)!));
  const locked = document.timeline.tracks.filter((track) => touched.has(track.id) && track.locked).map((track) => track.id);
  if (locked.length) return commandFailure(document, 'track-locked', `Unlinking touches locked track(s): ${locked.join(', ')}`, { trackIds: locked });
  const tracks = document.timeline.tracks.map((track): EditorTrack => touched.has(track.id)
    ? {
        ...track,
        clips: track.clips.map((clip): TimelineClip => {
          if (!ids.includes(clip.id) || !clip.linkGroupId) return clip;
          const { linkGroupId: _removed, ...rest } = clip;
          return rest as TimelineClip;
        }),
      }
    : track);
  const receipt = emptyCommandReceipt('clips.unlink');
  receipt.affectedTrackIds = [...touched];
  return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } }, receipt };
}
