import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';
import { assignClipToBestDirectorScene } from '../../semantic-scenes';
import { editorTrackAcceptsClip } from '../track-compatibility';

export interface MoveEditorClipOptions {
  trackId: string;
  clipId: string;
  startFrame: number;
  toTrackId?: string;
  includeLinked?: boolean;
}

/** Move one clip, and by default every linked partner, as one timeline transaction. */
export function moveEditorClip(document: EditorDocumentV2, options: MoveEditorClipOptions): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!Number.isInteger(options.startFrame) || options.startFrame < 0) {
    return commandFailure(document, 'invalid-range', 'Clip start must be a non-negative integral frame.', { path: 'startFrame' });
  }
  const source = document.timeline.tracks.find((track) => track.id === options.trackId);
  if (!source) return commandFailure(document, 'track-not-found', `Track does not exist: ${options.trackId}`, { trackIds: [options.trackId] });
  const moving = source.clips.find((clip) => clip.id === options.clipId);
  if (!moving) return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${options.trackId}: ${options.clipId}`, { trackIds: [options.trackId] });
  const targetId = options.toTrackId ?? options.trackId;
  const target = document.timeline.tracks.find((track) => track.id === targetId);
  if (!target) return commandFailure(document, 'track-not-found', `Track does not exist: ${targetId}`, { trackIds: [targetId] });
  if (!editorTrackAcceptsClip(target, moving)) {
    return commandFailure(document, 'invalid-command', `${moving.kind} clip ${moving.id} cannot move to ${target.type} track ${targetId}.`, {
      path: 'toTrackId',
      trackIds: [targetId],
    });
  }

  const ids = new Set<string>([moving.id]);
  if ((options.includeLinked ?? true) && moving.linkGroupId) {
    for (const track of document.timeline.tracks) {
      for (const clip of track.clips) if (clip.linkGroupId === moving.linkGroupId) ids.add(clip.id);
    }
  }
  const touched = new Set<string>([source.id, target.id]);
  for (const track of document.timeline.tracks) if (track.clips.some((clip) => ids.has(clip.id))) touched.add(track.id);
  const locked = document.timeline.tracks.filter((track) => touched.has(track.id) && track.locked).map((track) => track.id);
  if (locked.length) return commandFailure(document, 'track-locked', `Clip move touches locked track(s): ${locked.join(', ')}`, { trackIds: locked });

  const delta = options.startFrame - moving.startFrame;
  if (!delta && target.id === source.id) return { ok: true, document, receipt: emptyCommandReceipt('clip.move') };
  const movedById = new Map<string, TimelineClip>();
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (!ids.has(clip.id)) continue;
      const startFrame = clip.startFrame + delta;
      if (startFrame < 0) return commandFailure(document, 'invalid-range', 'Moving linked clips would place one before frame zero.', { path: 'startFrame' });
      movedById.set(clip.id, { ...clip, startFrame });
    }
  }

  const tracks = document.timeline.tracks.map((track): EditorTrack => {
    let clips = track.clips.map((clip) => movedById.get(clip.id) ?? clip);
    if (target.id !== source.id) {
      if (track.id === source.id) clips = clips.filter((clip) => clip.id !== moving.id);
      if (track.id === target.id) clips = [...clips, movedById.get(moving.id)!];
    }
    return touched.has(track.id) ? { ...track, clips: [...clips].sort((left, right) => left.startFrame - right.startFrame) } : track;
  });
  let next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks } };
  for (const clipId of ids) {
    const assigned = assignClipToBestDirectorScene(next, clipId);
    if (!assigned.ok) return commandFailure(document, 'invalid-command', assigned.error, { path: 'sceneId' });
    next = assigned.document;
  }
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('clip.move');
  receipt.affectedTrackIds = [...touched];
  receipt.shiftedClipIds = [...ids];
  return { ok: true, document: next, receipt };
}
