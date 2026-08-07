/** Native audio clip transactions shared by manual panels, browser agents and offline MCP. */

import {
  AUDIO_MIN_LEN_SEC,
  audioClipDefaults,
  patchAudioClip,
  splitAudioClipAt,
  type AudioClip,
} from './audio-tracks';
import {
  applyEditorCommand,
  positiveDurationFrames,
  secondsToTimelineFrames,
  timelineFramesToSeconds,
  type AudioTimelineClip,
  type AudioTimelineClipPatchUpdate,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type EditorMediaAsset,
} from './editor-document';

type AudioPropertyPatch = Partial<Pick<AudioClip,
  'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'inSec' | 'outSec' | 'muted'
>>;

export type AudioDocumentEditResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export type AddAudioDocumentClipResult = AudioDocumentEditResult & {
  clipId?: string;
  trackId?: string;
  assetId?: string;
};

export type SplitAudioDocumentClipResult = AudioDocumentEditResult & { newClipId?: string };

export interface AddAudioDocumentClipInput {
  document: EditorDocumentV2;
  clip: AudioClip;
  toTrackId?: string;
}

export interface AudioDocumentPatchInput {
  document: EditorDocumentV2;
  updates: readonly { clipId: string; patch: AudioPropertyPatch }[];
}

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  details: Pick<EditorCommandError, 'path' | 'trackIds'> = {},
): Extract<AudioDocumentEditResult, { ok: false }> {
  return { ok: false, document, error: { code, message, ...details } };
}

function durableLocator(clip: AudioClip): EditorMediaAsset['locator'] {
  return {
    ...(clip.sig ? { localSig: clip.sig } : {}),
    ...(!/^(?:blob|data):/i.test(clip.src) ? { remoteUrl: clip.src } : {}),
  };
}

function existingAsset(document: EditorDocumentV2, clip: AudioClip): EditorMediaAsset | undefined {
  return Object.values(document.assets).find((asset) => asset.kind === 'audio' && (
    (clip.sig && asset.locator.localSig === clip.sig)
    || (!/^(?:blob|data):/i.test(clip.src) && asset.locator.remoteUrl === clip.src)
  ));
}

function uniqueId(base: string, used: ReadonlySet<string>): string {
  const stem = base.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'audio';
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

function audioLaneId(document: EditorDocumentV2): string {
  return uniqueId('track_audio_1', new Set(document.timeline.tracks.map((track) => track.id)));
}

function assetIdFor(document: EditorDocumentV2, clipId: string): string {
  return uniqueId(`asset_audio_${clipId}`, new Set(Object.keys(document.assets)));
}

function normalizedAudioClip(clip: AudioClip): AudioClip {
  return patchAudioClip(clip, {});
}

function propertiesOf(clip: AudioClip): AudioTimelineClip['properties'] {
  const {
    id: _id, src: _src, sig: _sig, durationSec: _durationSec,
    startSec: _startSec, inSec: _inSec, outSec: _outSec,
    ...properties
  } = clip;
  return properties;
}

function nativeAudioClip(document: EditorDocumentV2, clipId: string): { trackId: string; clip: AudioTimelineClip; legacy: AudioClip } | null {
  for (const track of document.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (!clip || clip.kind !== 'audio') continue;
    const asset = document.assets[clip.assetId];
    if (!asset) return null;
    return {
      trackId: track.id,
      clip,
      legacy: {
        id: clip.id,
        src: asset.locator.remoteUrl ?? `blob:pireel-offline/${asset.id}`,
        ...(asset.locator.localSig ? { sig: asset.locator.localSig } : {}),
        ...(asset.label ? { label: asset.label } : {}),
        ...(asset.metadata.durationSec ? { durationSec: asset.metadata.durationSec } : {}),
        startSec: timelineFramesToSeconds(clip.startFrame, document.canvas.fps),
        inSec: clip.sourceInSec,
        ...(clip.sourceOutSec != null ? { outSec: clip.sourceOutSec } : {}),
        ...clip.properties,
      },
    };
  }
  return null;
}

/** Add a durable audio asset and place its clip on an existing or newly-created music lane. */
export function addAudioDocumentClip(input: AddAudioDocumentClipInput): AddAudioDocumentClipResult {
  if (!input.clip.id.trim()) return failure(input.document, 'invalid-command', 'Audio clip id is required.', { path: 'clip.id' });
  if (!input.clip.src.trim()) return failure(input.document, 'invalid-command', 'Audio source is required.', { path: 'clip.src' });
  const locator = durableLocator(input.clip);
  if (!locator.localSig && !locator.remoteUrl && !locator.cloudKey) {
    return failure(input.document, 'invalid-command', 'Audio source needs a durable local signature or remote URL.', { path: 'clip.src' });
  }
  const normalized = normalizedAudioClip(input.clip);
  const defaults = audioClipDefaults(normalized);
  const knownOut = Number.isFinite(defaults.outSec) ? defaults.outSec : undefined;
  const durationSec = knownOut == null ? undefined : (knownOut - defaults.inSec) / defaults.speed;
  if (durationSec != null && durationSec < AUDIO_MIN_LEN_SEC) {
    return failure(input.document, 'invalid-range', 'Audio clip is shorter than the minimum timeline duration.', { path: 'clip.durationSec' });
  }

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  let track = input.toTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === input.toTrackId)
    : document.timeline.tracks.find((candidate) => candidate.type === 'audio' && candidate.role === 'music')
      ?? document.timeline.tracks.find((candidate) => candidate.type === 'audio');
  if (input.toTrackId && (!track || track.type !== 'audio')) {
    return failure(input.document, track ? 'invalid-command' : 'track-not-found', `Audio track does not exist: ${input.toTrackId}`, { trackIds: [input.toTrackId] });
  }
  if (!track) {
    const trackId = audioLaneId(document);
    const insertedTrack = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: trackId, type: 'audio', role: 'music', name: 'Audio 1', syncLocked: true, stackOrder: 0 },
    });
    if (!insertedTrack.ok) return { ok: false, document: input.document, error: insertedTrack.error };
    document = insertedTrack.document;
    receipts.push(insertedTrack.receipt);
    track = document.timeline.tracks.find((candidate) => candidate.id === trackId)!;
  }

  const reused = existingAsset(document, normalized);
  const assetId = reused?.id ?? assetIdFor(document, normalized.id);
  const asset: EditorMediaAsset | undefined = reused ? undefined : {
    id: assetId,
    kind: 'audio',
    ...(normalized.label ? { label: normalized.label } : {}),
    locator,
    metadata: { ...(normalized.durationSec ? { durationSec: normalized.durationSec } : {}) },
  };
  const clip: AudioTimelineClip = {
    id: normalized.id,
    kind: 'audio',
    assetId,
    startFrame: secondsToTimelineFrames(defaults.startSec, document.canvas.fps),
    durationFrames: durationSec == null ? 1 : positiveDurationFrames(durationSec, document.canvas.fps),
    enabled: true,
    sourceInSec: defaults.inSec,
    ...(knownOut != null ? { sourceOutSec: knownOut } : {}),
    properties: propertiesOf(normalized),
    anchor: { type: 'timeline' },
  };
  const inserted = applyEditorCommand(document, { type: 'audio.insert', trackId: track.id, clip, ...(asset ? { asset } : {}) });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  return {
    ok: true,
    document: inserted.document,
    receipts: [...receipts, inserted.receipt],
    clipId: clip.id,
    trackId: track.id,
    assetId,
  };
}

/** Normalize legacy audio knobs into one exact V2 geometry/source/property batch. */
export function applyAudioDocumentEdits(input: AudioDocumentPatchInput): AudioDocumentEditResult {
  if (!input.updates.length) return failure(input.document, 'invalid-command', 'At least one audio patch is required.', { path: 'updates' });
  const updates: AudioTimelineClipPatchUpdate[] = [];
  const seen = new Set<string>();
  for (const [index, update] of input.updates.entries()) {
    if (seen.has(update.clipId)) return failure(input.document, 'invalid-command', `Audio clip is targeted more than once: ${update.clipId}`, { path: `updates[${index}].clipId` });
    seen.add(update.clipId);
    const found = nativeAudioClip(input.document, update.clipId);
    if (!found) return failure(input.document, 'clip-not-found', `Audio clip does not exist: ${update.clipId}`, { path: `updates[${index}].clipId` });
    const normalized = patchAudioClip(found.legacy, update.patch);
    const defaults = audioClipDefaults(normalized);
    const knownOut = Number.isFinite(defaults.outSec) ? defaults.outSec : undefined;
    const durationSec = knownOut == null ? undefined : (knownOut - defaults.inSec) / defaults.speed;
    if (durationSec != null && durationSec < AUDIO_MIN_LEN_SEC) {
      return failure(input.document, 'invalid-range', 'Audio trim must leave at least 0.2 seconds.', { path: `updates[${index}].patch` });
    }
    updates.push({
      clipId: update.clipId,
      patch: {
        startFrame: secondsToTimelineFrames(defaults.startSec, input.document.canvas.fps),
        durationFrames: durationSec == null ? found.clip.durationFrames : positiveDurationFrames(durationSec, input.document.canvas.fps),
        sourceInSec: defaults.inSec,
        sourceOutSec: knownOut ?? null,
        properties: propertiesOf(normalized),
      },
    });
  }
  const command = applyEditorCommand(input.document, { type: 'audio.patch', updates });
  if (!command.ok) return { ok: false, document: input.document, error: command.error };
  return { ok: true, document: command.document, receipts: [command.receipt] };
}

/** Remove exact audio identities across lanes; lanes disappear when their final clip is removed. */
export function removeAudioDocumentClips(document: EditorDocumentV2, clipIds: readonly string[]): AudioDocumentEditResult {
  const ids = [...new Set(clipIds)];
  if (!ids.length) return failure(document, 'invalid-command', 'At least one audio clip id is required.', { path: 'clipIds' });
  const byTrack = new Map<string, string[]>();
  for (const [index, id] of ids.entries()) {
    const found = nativeAudioClip(document, id);
    if (!found) return failure(document, 'clip-not-found', `Audio clip does not exist: ${id}`, { path: `clipIds[${index}]` });
    byTrack.set(found.trackId, [...(byTrack.get(found.trackId) ?? []), id]);
  }
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [trackId, idsOnTrack] of byTrack) {
    const command = applyEditorCommand(next, { type: 'clips.remove', trackId, clipIds: idsOnTrack, includeLinked: false });
    if (!command.ok) return { ok: false, document, error: command.error };
    next = command.document;
    receipts.push(command.receipt);
  }
  return { ok: true, document: next, receipts };
}

/** Split one audio clip without an audible default-fade dip at the new internal seam. */
export function splitAudioDocumentClip(document: EditorDocumentV2, clipId: string, atSec: number): SplitAudioDocumentClipResult {
  const found = nativeAudioClip(document, clipId);
  if (!found) return failure(document, 'clip-not-found', `Audio clip does not exist: ${clipId}`, { path: 'clipId' });
  if (!Number.isFinite(atSec)) return failure(document, 'invalid-range', 'Audio split time must be finite.', { path: 'atSec' });
  if (!splitAudioClipAt(found.legacy, atSec, () => 'preview')) {
    return failure(document, 'invalid-range', 'Audio split must leave at least 0.2 seconds on both sides.', { path: 'atSec' });
  }
  const split = applyEditorCommand(document, {
    type: 'clip.split',
    trackId: found.trackId,
    clipId,
    atFrame: secondsToTimelineFrames(atSec, document.canvas.fps),
    includeLinked: false,
  });
  if (!split.ok) return { ok: false, document, error: split.error };
  const newClipId = split.receipt.createdClipIds[0];
  if (!newClipId) return failure(document, 'invalid-command', 'Audio split did not create a right-hand clip.');
  const fades = applyAudioDocumentEdits({
    document: split.document,
    updates: [
      { clipId, patch: { fadeOutSec: 0 } },
      { clipId: newClipId, patch: { fadeInSec: 0 } },
    ],
  });
  if (!fades.ok) return { ok: false, document, error: fades.error };
  return { ok: true, document: fades.document, receipts: [split.receipt, ...fades.receipts], newClipId };
}
