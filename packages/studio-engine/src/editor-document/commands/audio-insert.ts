import type { AudioTimelineClip, EditorDocumentV2, EditorMediaAsset, EditorTrack } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { audioTimelineStateError } from './audio-patch';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

function assetError(asset: EditorMediaAsset): string | null {
  if (!asset.id.trim()) return 'Audio asset id is required.';
  if (asset.kind !== 'audio') return 'Audio clips require an audio asset.';
  if (!asset.locator || typeof asset.locator !== 'object') return 'Audio asset locator is required.';
  if (!asset.locator.localSig && !asset.locator.cloudKey && !asset.locator.remoteUrl) return 'Audio asset needs at least one durable locator.';
  if (!asset.metadata || typeof asset.metadata !== 'object') return 'Audio asset metadata is required.';
  if (asset.metadata.durationSec != null && (!Number.isFinite(asset.metadata.durationSec) || asset.metadata.durationSec <= 0)) {
    return 'Audio asset duration must be positive when supplied.';
  }
  return null;
}

/** Place one audio clip without shifting or clearing overlapping material on its lane. */
export function insertAudioClip(
  document: EditorDocumentV2,
  trackId: string,
  clip: AudioTimelineClip,
  asset?: EditorMediaAsset,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  if (track.type !== 'audio') return commandFailure(document, 'invalid-command', `Track is not an audio lane: ${trackId}`, { trackIds: [trackId] });
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });
  if (clip.kind !== 'audio') return commandFailure(document, 'invalid-command', 'audio.insert requires an audio clip.', { path: 'clip.kind' });
  const invalidClip = audioTimelineStateError({
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    sourceInSec: clip.sourceInSec,
    sourceOutSec: clip.sourceOutSec ?? null,
    properties: clip.properties,
  }, document.canvas.fps);
  if (invalidClip) return commandFailure(document, 'invalid-command', invalidClip, { path: 'clip' });
  if (asset) {
    const invalidAsset = assetError(asset);
    if (invalidAsset) return commandFailure(document, 'invalid-command', invalidAsset, { path: 'asset' });
    if (asset.id !== clip.assetId) return commandFailure(document, 'invalid-command', 'Inserted asset id must match clip.assetId.', { path: 'clip.assetId' });
    if (document.assets[asset.id]) return commandFailure(document, 'invalid-command', `Asset already exists: ${asset.id}`, { path: 'asset.id' });
  } else {
    const existingAsset = document.assets[clip.assetId];
    if (!existingAsset) return commandFailure(document, 'invalid-command', `Audio asset does not exist: ${clip.assetId}`, { path: 'clip.assetId' });
    if (existingAsset.kind !== 'audio') return commandFailure(document, 'invalid-command', `Asset is not audio: ${clip.assetId}`, { path: 'clip.assetId' });
  }
  if (document.timeline.tracks.some((candidate) => candidate.clips.some((item) => item.id === clip.id))) {
    return commandFailure(document, 'duplicate-clip-id', `Clip already exists: ${clip.id}`, { path: 'clip.id' });
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
  const receipt = emptyCommandReceipt('audio.insert');
  receipt.affectedTrackIds = [trackId];
  receipt.createdClipIds = [clip.id];
  return { ok: true, document: next, receipt };
}
