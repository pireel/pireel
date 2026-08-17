import type { EditorDocumentV2, EditorMediaAsset, EditorTrack, GraphicTimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';
import { editorTrackAcceptsClip } from '../track-compatibility';

function assetError(asset: EditorMediaAsset): string | null {
  if (!asset.id.trim()) return 'Overlay asset id is required.';
  if (asset.kind !== 'image' && asset.kind !== 'video') return 'Overlay media requires an image or video asset.';
  if (!asset.locator.localSig && !asset.locator.cloudKey && !asset.locator.remoteUrl) return 'Overlay asset needs at least one durable locator.';
  return null;
}

/** Place one graphic identity without shifting or clearing overlapping material. */
export function insertOverlayClip(
  document: EditorDocumentV2,
  trackId: string,
  clip: GraphicTimelineClip,
  asset?: EditorMediaAsset,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  if (!editorTrackAcceptsClip(track, clip)) return commandFailure(document, 'invalid-command', `Track cannot contain graphic clips: ${trackId}`, { trackIds: [trackId] });
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });
  if (!clip.id.trim()) return commandFailure(document, 'invalid-command', 'Overlay clip id is required.', { path: 'clip.id' });
  if (clip.kind !== 'graphic') return commandFailure(document, 'invalid-command', 'overlay.insert requires a graphic clip.', { path: 'clip.kind' });
  if (!Number.isInteger(clip.startFrame) || clip.startFrame < 0 || !Number.isInteger(clip.durationFrames) || clip.durationFrames <= 0) {
    return commandFailure(document, 'invalid-range', 'Overlay placement must use non-negative integral frames and a positive duration.', { path: 'clip' });
  }
  if (document.timeline.tracks.some((candidate) => candidate.clips.some((item) => item.id === clip.id))) {
    return commandFailure(document, 'duplicate-clip-id', `Clip already exists: ${clip.id}`, { path: 'clip.id' });
  }
  if (asset) {
    const invalidAsset = assetError(asset);
    if (invalidAsset) return commandFailure(document, 'invalid-command', invalidAsset, { path: 'asset' });
    if (asset.id !== clip.assetId) return commandFailure(document, 'invalid-command', 'Inserted asset id must match clip.assetId.', { path: 'clip.assetId' });
    if (document.assets[asset.id]) return commandFailure(document, 'invalid-command', `Asset already exists: ${asset.id}`, { path: 'asset.id' });
  } else if (clip.assetId) {
    const existing = document.assets[clip.assetId];
    if (!existing) return commandFailure(document, 'invalid-command', `Overlay asset does not exist: ${clip.assetId}`, { path: 'clip.assetId' });
    if (existing.kind !== 'image' && existing.kind !== 'video') {
      return commandFailure(document, 'invalid-command', `Asset is not visual media: ${clip.assetId}`, { path: 'clip.assetId' });
    }
  }

  const tracks = document.timeline.tracks.map((candidate): EditorTrack => candidate.id === trackId
    ? { ...candidate, clips: [...candidate.clips, clip].sort((left, right) => left.startFrame - right.startFrame) }
    : candidate);
  const next: EditorDocumentV2 = {
    ...document,
    ...(asset ? { assets: { ...document.assets, [asset.id]: asset } } : {}),
    timeline: { ...document.timeline, tracks },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('overlay.insert');
  receipt.affectedTrackIds = [trackId];
  receipt.createdClipIds = [clip.id];
  return { ok: true, document: next, receipt };
}
