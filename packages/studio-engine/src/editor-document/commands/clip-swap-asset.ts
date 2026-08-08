import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

function accepts(clip: TimelineClip, kind: EditorDocumentV2['assets'][string]['kind']): boolean {
  if (clip.kind === 'audio') return kind === 'audio';
  if (clip.kind === 'narrative') return kind === 'video';
  if (clip.kind === 'media' || clip.kind === 'graphic') return kind === 'video' || kind === 'image';
  return false;
}

/** Swap media identity while preserving clip timing, track, links, anchors and semantic placement. */
export function swapEditorClipAsset(document: EditorDocumentV2, trackId: string, clipId: string, assetId: string): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });
  const clip = track.clips.find((candidate) => candidate.id === clipId);
  if (!clip) return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${trackId}: ${clipId}`, { trackIds: [trackId] });
  const asset = document.assets[assetId];
  if (!asset) return commandFailure(document, 'invalid-command', `Asset does not exist: ${assetId}`, { path: 'assetId' });
  if (!accepts(clip, asset.kind)) return commandFailure(document, 'invalid-command', `${asset.kind} is incompatible with a ${clip.kind} clip.`, { path: 'assetId' });
  if (clip.kind === 'caption') return commandFailure(document, 'invalid-command', 'Caption clips do not own media assets.', { path: 'clipId' });
  const currentAssetId = 'assetId' in clip ? clip.assetId : undefined;
  if (currentAssetId === assetId) return { ok: true, document, receipt: emptyCommandReceipt('clip.swapAsset') };
  const nextClip = { ...clip, assetId } as TimelineClip;
  const tracks = document.timeline.tracks.map((candidate): EditorTrack => candidate.id === trackId
    ? { ...candidate, clips: candidate.clips.map((item) => item.id === clipId ? nextClip : item) }
    : candidate);
  const next = { ...document, timeline: { ...document.timeline, tracks } };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('clip.swapAsset');
  receipt.affectedTrackIds = [trackId];
  return { ok: true, document: next, receipt };
}
