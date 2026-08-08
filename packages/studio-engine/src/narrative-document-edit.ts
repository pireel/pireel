/** Native primary-narrative insertion and ordering transactions. */

import type { VideoShot } from './composition-core';
import {
  applyEditorCommand,
  positiveDurationFrames,
  secondsToTimelineFrames,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type MediaTimelineClip,
  type NarrativeTimelineClip,
  type NarrativeProperties,
} from './editor-document';
import { clearRangeFromClip } from './editor-document/commands/clip-geometry';
import { detachDanglingClipAnchors, updateScenesForClipChanges } from './editor-document/commands/clip-references';
import { validateEditorDocumentV2 } from './editor-document/validation';

export type NarrativeStructureEditResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[]; clipId?: string; assetId?: string }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export interface AddNarrativeDocumentClipInput {
  document: EditorDocumentV2;
  shot: VideoShot;
  atSec: number;
  sourceWidth?: number;
  sourceHeight?: number;
  configureCanvas?: boolean;
  mode?: 'ripple' | 'overwrite';
  sceneId?: string;
}

export interface InsertNarrativeAssetRangeInput {
  document: EditorDocumentV2;
  assetId: string;
  clipId: string;
  atSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  properties: NarrativeProperties;
}

export interface MoveNarrativeDocumentClipInput {
  document: EditorDocumentV2;
  clipId: string;
  atSec: number;
}

export interface MoveNarrativeDocumentClipToVisualTrackInput extends MoveNarrativeDocumentClipInput {
  targetTrackId?: string;
  newTrack?: { id: string; name?: string; stackOrder: number };
}

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  path?: string,
): Extract<NarrativeStructureEditResult, { ok: false }> {
  return { ok: false, document, error: { code, message, ...(path ? { path } : {}) } };
}

function uniqueId(base: string, used: ReadonlySet<string>): string {
  const stem = base.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'narrative';
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

function durableLocator(shot: VideoShot): EditorMediaAsset['locator'] {
  return {
    ...(shot.srcSig ? { localSig: shot.srcSig } : {}),
    ...(shot.src && !/^(?:blob|data):/i.test(shot.src) ? { remoteUrl: shot.src } : {}),
  };
}

function existingAsset(document: EditorDocumentV2, shot: VideoShot): EditorMediaAsset | undefined {
  return Object.values(document.assets).find((asset) => asset.kind === 'video' && (
    (shot.srcSig && asset.locator.localSig === shot.srcSig)
    || (shot.src && !/^(?:blob|data):/i.test(shot.src) && asset.locator.remoteUrl === shot.src)
  ));
}

function narrativeProperties(shot: VideoShot): NarrativeTimelineClip['properties'] {
  const {
    id: _id, src: _src, srcSig: _srcSig, srcStart: _srcStart, srcEnd: _srcEnd,
    mediaFraming: _mediaFraming,
    ...properties
  } = shot;
  return properties;
}

/** Add one equal-standing source and ripple every sync-locked lane in a single publish transaction. */
export function addNarrativeDocumentClip(input: AddNarrativeDocumentClipInput): NarrativeStructureEditResult {
  if (!input.shot.id.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'shot.id');
  if (!input.shot.src?.trim()) return failure(input.document, 'invalid-command', 'Inserted narrative source is required.', 'shot.src');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative insert time must be non-negative.', 'atSec');
  const durationSec = input.shot.srcEnd - input.shot.srcStart;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return failure(input.document, 'invalid-range', 'Narrative source range must be positive.', 'shot');
  const locator = durableLocator(input.shot);
  if (!locator.localSig && !locator.cloudKey && !locator.remoteUrl) {
    return failure(input.document, 'invalid-command', 'Narrative source needs a durable local signature or remote URL.', 'shot.src');
  }

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const firstSource = !primary?.clips.length && !document.semantics.primaryNarrativeAssetId;
  if (firstSource && input.configureCanvas !== false && input.sourceWidth && input.sourceHeight) {
    const canvas = applyEditorCommand(document, { type: 'canvas.patch', patch: { width: input.sourceWidth, height: input.sourceHeight } });
    if (!canvas.ok) return { ok: false, document: input.document, error: canvas.error };
    document = canvas.document;
    receipts.push(canvas.receipt);
  }

  const reused = existingAsset(document, input.shot);
  const assetId = reused?.id ?? uniqueId(`asset_video_${input.shot.id}`, new Set(Object.keys(document.assets)));
  const asset: EditorMediaAsset | undefined = reused ? undefined : {
    id: assetId,
    kind: 'video',
    label: input.shot.srcSig ?? 'Narrative source',
    locator,
    metadata: {
      durationSec: input.shot.srcEnd,
      ...(input.sourceWidth ? { width: input.sourceWidth } : {}),
      ...(input.sourceHeight ? { height: input.sourceHeight } : {}),
      hasAudio: true,
    },
  };
  const clip: Omit<NarrativeTimelineClip, 'startFrame'> = {
    id: input.shot.id,
    kind: 'narrative',
    assetId,
    durationFrames: positiveDurationFrames(durationSec, document.canvas.fps),
    enabled: true,
    sourceInSec: input.shot.srcStart,
    sourceOutSec: input.shot.srcEnd,
    ...(input.shot.mediaFraming ? { mediaFraming: input.shot.mediaFraming } : {}),
    properties: narrativeProperties(input.shot),
  };
  const inserted = applyEditorCommand(document, {
    type: 'narrative.insert',
    atFrame: secondsToTimelineFrames(input.atSec, document.canvas.fps),
    clip,
    ...(asset ? { asset } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const captions = applyEditorCommand(inserted.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [...receipts, inserted.receipt, captions.receipt],
    clipId: clip.id,
    assetId,
  };
}

/** Restore/place a range from an asset already owned by the document. */
export function insertNarrativeAssetRange(input: InsertNarrativeAssetRangeInput): NarrativeStructureEditResult {
  const asset = input.document.assets[input.assetId];
  if (!asset || asset.kind !== 'video') return failure(input.document, 'invalid-command', `Narrative video asset does not exist: ${input.assetId}`, 'assetId');
  if (!input.clipId.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'clipId');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative insert time must be non-negative.', 'atSec');
  const durationSec = input.sourceOutSec - input.sourceInSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return failure(input.document, 'invalid-range', 'Narrative source range must be positive.', 'sourceRange');
  const inserted = applyEditorCommand(input.document, {
    type: 'narrative.insert',
    atFrame: secondsToTimelineFrames(input.atSec, input.document.canvas.fps),
    clip: {
      id: input.clipId,
      kind: 'narrative',
      assetId: input.assetId,
      durationFrames: positiveDurationFrames(durationSec, input.document.canvas.fps),
      enabled: true,
      sourceInSec: input.sourceInSec,
      sourceOutSec: input.sourceOutSec,
      properties: input.properties,
    },
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const captions = applyEditorCommand(inserted.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return { ok: true, document: captions.document, receipts: [inserted.receipt, captions.receipt], clipId: input.clipId, assetId: input.assetId };
}

/** Reorder stable narrative identities and relay managed captions atomically. */
export function reorderNarrativeDocumentClips(
  document: EditorDocumentV2,
  clipIds: readonly string[],
): NarrativeStructureEditResult {
  const reordered = applyEditorCommand(document, { type: 'narrative.reorder', clipIds: [...clipIds] });
  if (!reordered.ok) return { ok: false, document, error: reordered.error };
  const captions = applyEditorCommand(reordered.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document, error: captions.error };
  return { ok: true, document: captions.document, receipts: [reordered.receipt, captions.receipt] };
}

/** Move one primary clip to an exact final-cut time. The destination is overwrite semantics on the
 * primary lane only: unrelated graphics/audio lanes keep their absolute positions, while managed
 * captions are derived again from the resulting narrative geometry. */
export function moveNarrativeDocumentClip(input: MoveNarrativeDocumentClipInput): NarrativeStructureEditResult {
  if (!input.clipId.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'clipId');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative move time must be non-negative.', 'atSec');
  const primary = input.document.timeline.tracks.find((track) => track.id === input.document.semantics.primaryNarrativeTrackId);
  const source = primary?.clips.find((clip): clip is NarrativeTimelineClip => clip.id === input.clipId && clip.kind === 'narrative');
  if (!primary || !source) return failure(input.document, 'clip-not-found', `Narrative clip does not exist: ${input.clipId}`, 'clipId');
  const startFrame = secondsToTimelineFrames(input.atSec, input.document.canvas.fps);
  const moved = applyEditorCommand(input.document, {
    type: 'clip.move',
    trackId: primary.id,
    clipId: source.id,
    startFrame,
    includeLinked: true,
  });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };

  const movedPrimary = moved.document.timeline.tracks.find((track) => track.id === primary.id)!;
  const movedClip = movedPrimary.clips.find((clip): clip is NarrativeTimelineClip => clip.id === source.id && clip.kind === 'narrative')!;
  const endFrame = movedClip.startFrame + movedClip.durationFrames;
  const usedIds = new Set(moved.document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const removedClipIds = new Set<string>();
  const createdClipIds: string[] = [];
  const splitPairs = new Map<string, string[]>();
  const primaryClips = movedPrimary.clips.flatMap((clip) => {
    if (clip.id === movedClip.id) return [clip];
    const edit = clearRangeFromClip(clip, movedClip.startFrame, endFrame, moved.document.canvas.fps, usedIds);
    edit.removedClipIds.forEach((id) => removedClipIds.add(id));
    createdClipIds.push(...edit.createdClipIds);
    for (const [originalId, rightId] of edit.splitPairs) {
      splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
    }
    return edit.clips;
  }).sort((left, right) => left.startFrame - right.startFrame);
  let tracks = moved.document.timeline.tracks.map((track) => track.id === primary.id ? { ...track, clips: primaryClips } : track);
  const survivingIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const detached = detachDanglingClipAnchors(tracks, survivingIds);
  if (detached.lockedTrackIds.length) {
    return failure(input.document, 'track-locked', `Moving the clip would detach anchors on locked track(s): ${detached.lockedTrackIds.join(', ')}`);
  }
  tracks = detached.tracks;
  let semantics: EditorDocumentV2['semantics'] = {
    ...moved.document.semantics,
    scenes: updateScenesForClipChanges(moved.document.semantics.scenes, removedClipIds, splitPairs),
  };
  if (semantics.managedCaptionSource?.mode === 'clip' && removedClipIds.has(semantics.managedCaptionSource.clipId)) {
    semantics = { ...semantics, managedCaptionSource: { mode: 'auto' } };
  }
  const overwritten: EditorDocumentV2 = { ...moved.document, timeline: { ...moved.document.timeline, tracks }, semantics };
  const issue = validateEditorDocumentV2(overwritten).find((candidate) => candidate.severity === 'error');
  if (issue) return failure(input.document, 'invalid-command', issue.message, issue.path);
  const captions = applyEditorCommand(overwritten, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [{
      ...moved.receipt,
      affectedTrackIds: [...new Set([...moved.receipt.affectedTrackIds, primary.id, ...detached.changedTrackIds])],
      removedClipIds: [...new Set([...moved.receipt.removedClipIds, ...removedClipIds])],
      createdClipIds: [...new Set([...moved.receipt.createdClipIds, ...createdClipIds])],
    }, captions.receipt],
    clipId: movedClip.id,
    assetId: movedClip.assetId,
  };
}

/** Promote one semantic-primary video clip into an ordinary compositing clip. The media asset and
 * stable clip identity are retained, so render/export and any clip anchors keep addressing it. */
export function moveNarrativeDocumentClipToVisualTrack(
  input: MoveNarrativeDocumentClipToVisualTrackInput,
): NarrativeStructureEditResult {
  if (!input.clipId.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'clipId');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative move time must be non-negative.', 'atSec');
  if (!!input.targetTrackId === !!input.newTrack) {
    return failure(input.document, 'invalid-command', 'Choose exactly one existing or new visual target track.', 'targetTrack');
  }
  const primary = input.document.timeline.tracks.find((track) => track.id === input.document.semantics.primaryNarrativeTrackId);
  const source = primary?.clips.find((clip): clip is NarrativeTimelineClip => clip.id === input.clipId && clip.kind === 'narrative');
  if (!primary || !source) return failure(input.document, 'clip-not-found', `Narrative clip does not exist: ${input.clipId}`, 'clipId');

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  let targetTrackId = input.targetTrackId;
  if (input.newTrack) {
    const insertedTrack = applyEditorCommand(document, {
      type: 'track.insert',
      track: {
        id: input.newTrack.id,
        type: 'visual',
        role: 'broll',
        ...(input.newTrack.name ? { name: input.newTrack.name } : {}),
        stackOrder: input.newTrack.stackOrder,
        syncLocked: true,
      },
    });
    if (!insertedTrack.ok) return { ok: false, document: input.document, error: insertedTrack.error };
    document = insertedTrack.document;
    receipts.push(insertedTrack.receipt);
    targetTrackId = input.newTrack.id;
  }
  const target = document.timeline.tracks.find((track) => track.id === targetTrackId);
  if (!target || target.type !== 'visual' || target.id === primary.id) {
    return failure(input.document, 'invalid-command', `Visual target track does not exist: ${targetTrackId ?? ''}`, 'targetTrack');
  }
  if (target.locked) return failure(input.document, 'track-locked', `Visual target track is locked: ${target.id}`);

  const moved = applyEditorCommand(document, {
    type: 'clip.move',
    trackId: primary.id,
    clipId: source.id,
    startFrame: secondsToTimelineFrames(input.atSec, document.canvas.fps),
    includeLinked: true,
  });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
  receipts.push(moved.receipt);
  const movedPrimary = moved.document.timeline.tracks.find((track) => track.id === primary.id)!;
  const narrative = movedPrimary.clips.find((clip): clip is NarrativeTimelineClip => clip.id === source.id && clip.kind === 'narrative')!;
  const media: MediaTimelineClip = {
    id: narrative.id,
    kind: 'media',
    assetId: narrative.assetId,
    startFrame: narrative.startFrame,
    durationFrames: narrative.durationFrames,
    enabled: narrative.enabled,
    ...(narrative.linkGroupId ? { linkGroupId: narrative.linkGroupId } : {}),
    sourceInSec: narrative.sourceInSec,
    sourceOutSec: narrative.sourceOutSec,
    fit: 'cover',
  };
  const tracks = moved.document.timeline.tracks.map((track) => {
    if (track.id === primary.id) return { ...track, clips: track.clips.filter((clip) => clip.id !== narrative.id) };
    if (track.id === target.id) return { ...track, clips: [...track.clips, media].sort((left, right) => left.startFrame - right.startFrame) };
    return track;
  });
  const converted: EditorDocumentV2 = { ...moved.document, timeline: { ...moved.document.timeline, tracks } };
  const issue = validateEditorDocumentV2(converted).find((candidate) => candidate.severity === 'error');
  if (issue) return failure(input.document, 'invalid-command', issue.message, issue.path);
  const captions = applyEditorCommand(converted, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [...receipts, captions.receipt],
    clipId: media.id,
    assetId: media.assetId,
  };
}
