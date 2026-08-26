/** Native primary-narrative insertion and ordering transactions. */

import type { VideoShot } from './composition-core';
import { atomicMediaFramingFromTreatment } from './composition-core';
import {
  applyEditorCommand,
  isVisualEditorTrack,
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
  /** Preferred project-local library identity. Content-equal assets may still be distinct imports. */
  assetId?: string;
  assetLabel?: string;
  assetLibrary?: EditorMediaAsset['library'];
}

export interface InsertNarrativeAssetRangeInput {
  document: EditorDocumentV2;
  assetId: string;
  clipId: string;
  atSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  properties: NarrativeProperties;
  box?: NarrativeTimelineClip['box'];
  mediaFraming?: NarrativeTimelineClip['mediaFraming'];
  /** Restore-only: fold the inserted source gap back into compatible source-contiguous neighbours. */
  coalesceAdjacent?: boolean;
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

function presentationKey(clip: NarrativeTimelineClip): string {
  const { transIn: _boundaryTransition, ...properties } = clip.properties;
  const mediaFraming = clip.mediaFraming ?? atomicMediaFramingFromTreatment(
    clip.properties.treatment ?? 'full',
    clip.properties.treatSize,
    clip.properties.treatCrop,
    clip.properties.preciseFraming,
  );
  return JSON.stringify({
    enabled: clip.enabled,
    linkGroupId: clip.linkGroupId,
    box: clip.box,
    mediaFraming,
    properties,
  });
}

function coalesceRestoredNarrativeClip(
  document: EditorDocumentV2,
  insertedClipId: string,
): { document: EditorDocumentV2; clipId: string; removedClipIds: string[] } {
  const trackIndex = document.timeline.tracks.findIndex((track) => track.id === document.semantics.primaryNarrativeTrackId);
  if (trackIndex < 0) return { document, clipId: insertedClipId, removedClipIds: [] };
  const track = document.timeline.tracks[trackIndex]!;
  let clips = track.clips
    .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  if (!clips.some((clip) => clip.id === insertedClipId)) return { document, clipId: insertedClipId, removedClipIds: [] };
  let activeId = insertedClipId;
  const replacements = new Map<string, { clipId: string; offsetFrames: number }>();
  const canMerge = (left: NarrativeTimelineClip, right: NarrativeTimelineClip): boolean => (
    left.startFrame + left.durationFrames === right.startFrame
    && left.assetId === right.assetId
    && Math.abs(left.sourceOutSec - right.sourceInSec) < 0.03
    && presentationKey(left) === presentationKey(right)
  );
  const mergeAt = (index: number) => {
    const left = clips[index]!;
    const right = clips[index + 1]!;
    const merged: NarrativeTimelineClip = {
      ...left,
      durationFrames: left.durationFrames + right.durationFrames,
      sourceOutSec: right.sourceOutSec,
    };
    replacements.set(right.id, { clipId: left.id, offsetFrames: right.startFrame - left.startFrame });
    if (activeId === right.id) activeId = left.id;
    clips = [...clips.slice(0, index), merged, ...clips.slice(index + 2)];
  };
  let changed = true;
  while (changed) {
    changed = false;
    const activeIndex = clips.findIndex((clip) => clip.id === activeId);
    if (activeIndex > 0 && canMerge(clips[activeIndex - 1]!, clips[activeIndex]!)) {
      mergeAt(activeIndex - 1);
      changed = true;
      continue;
    }
    if (activeIndex >= 0 && activeIndex < clips.length - 1 && canMerge(clips[activeIndex]!, clips[activeIndex + 1]!)) {
      mergeAt(activeIndex);
      changed = true;
    }
  }
  if (!replacements.size) return { document, clipId: insertedClipId, removedClipIds: [] };
  const resolveReplacement = (clipId: string): { clipId: string; offsetFrames: number } => {
    let resolvedId = clipId;
    let offsetFrames = 0;
    const seen = new Set<string>();
    while (replacements.has(resolvedId) && !seen.has(resolvedId)) {
      seen.add(resolvedId);
      const replacement = replacements.get(resolvedId)!;
      resolvedId = replacement.clipId;
      offsetFrames += replacement.offsetFrames;
    }
    return { clipId: resolvedId, offsetFrames };
  };
  const tracks = document.timeline.tracks.map((candidate, index) => {
    if (index === trackIndex) return { ...candidate, clips };
    return {
      ...candidate,
      clips: candidate.clips.map((clip) => {
        if (!('anchor' in clip) || clip.anchor.type !== 'clip') return clip;
        const replacement = resolveReplacement(clip.anchor.clipId);
        if (replacement.clipId === clip.anchor.clipId) return clip;
        return {
          ...clip,
          anchor: {
            ...clip.anchor,
            clipId: replacement.clipId,
            offsetFrames: clip.anchor.offsetFrames + replacement.offsetFrames,
          },
        };
      }),
    };
  });
  const scenes = document.semantics.scenes.map((scene) => {
    const clipIds: string[] = [];
    for (const id of scene.clipIds) {
      const resolved = resolveReplacement(id).clipId;
      if (!clipIds.includes(resolved)) clipIds.push(resolved);
    }
    return clipIds.length === scene.clipIds.length && clipIds.every((id, index) => id === scene.clipIds[index])
      ? scene
      : { ...scene, clipIds };
  });
  const captionSource = document.semantics.managedCaptionSource;
  const managedCaptionSource = captionSource?.mode === 'clip'
    ? { ...captionSource, clipId: resolveReplacement(captionSource.clipId).clipId }
    : captionSource;
  const next: EditorDocumentV2 = {
    ...document,
    timeline: { ...document.timeline, tracks },
    semantics: { ...document.semantics, scenes, ...(managedCaptionSource ? { managedCaptionSource } : {}) },
  };
  return {
    document: next,
    clipId: resolveReplacement(activeId).clipId,
    removedClipIds: [...replacements.keys()],
  };
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
  const firstSource = !primary?.clips.some((clip) => clip.kind === 'narrative');
  if (firstSource && input.configureCanvas !== false && input.sourceWidth && input.sourceHeight) {
    const canvas = applyEditorCommand(document, { type: 'canvas.patch', patch: { width: input.sourceWidth, height: input.sourceHeight } });
    if (!canvas.ok) return { ok: false, document: input.document, error: canvas.error };
    document = canvas.document;
    receipts.push(canvas.receipt);
  }

  const preferred = input.assetId ? document.assets[input.assetId] : undefined;
  const reused = preferred ?? (!input.assetId ? existingAsset(document, input.shot) : undefined);
  const assetId = reused?.id
    ?? (input.assetId && !document.assets[input.assetId]
      ? input.assetId
      : uniqueId(`asset_video_${input.shot.id}`, new Set(Object.keys(document.assets))));
  const asset: EditorMediaAsset | undefined = reused ? undefined : {
    id: assetId,
    kind: 'video',
    label: input.assetLabel ?? input.shot.srcSig ?? 'Narrative source',
    locator,
    metadata: {
      durationSec: input.shot.srcEnd,
      ...(input.sourceWidth ? { width: input.sourceWidth } : {}),
      ...(input.sourceHeight ? { height: input.sourceHeight } : {}),
      hasAudio: true,
    },
    ...(input.assetLibrary ? { library: input.assetLibrary } : {}),
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
      ...(input.box ? { box: input.box } : {}),
      ...(input.mediaFraming ? { mediaFraming: input.mediaFraming } : {}),
      properties: input.properties,
    },
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const coalesced = input.coalesceAdjacent
    ? coalesceRestoredNarrativeClip(inserted.document, input.clipId)
    : { document: inserted.document, clipId: input.clipId, removedClipIds: [] };
  const issue = validateEditorDocumentV2(coalesced.document).find((candidate) => candidate.severity === 'error');
  if (issue) return failure(input.document, 'invalid-command', issue.message, issue.path);
  const captions = applyEditorCommand(coalesced.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [{
      ...inserted.receipt,
      removedClipIds: [...new Set([...inserted.receipt.removedClipIds, ...coalesced.removedClipIds])],
    }, captions.receipt],
    clipId: coalesced.clipId,
    assetId: input.assetId,
  };
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
  if (!target || !isVisualEditorTrack(target) || target.id === primary.id) {
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
