/** NLE-style visual clip moves: rigid preview in the UI, one atomic overwrite transaction here. */

import {
  applyEditorCommand,
  isVisualEditorTrack,
  pruneEmptyNonPrimaryTracks,
  secondsToTimelineFrames,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type MediaTimelineClip,
  type MediaVideoProperties,
  type NarrativeTimelineClip,
  type TimelineClip,
} from './editor-document';
import { clearRangeFromClip } from './editor-document/commands/clip-geometry';
import { detachDanglingClipAnchors, updateScenesForClipChanges } from './editor-document/commands/clip-references';
import { validateEditorDocumentV2 } from './editor-document/validation';

export type VisualDocumentMoveTarget =
  | { kind: 'primary' }
  | { kind: 'visual'; trackId: string }
  | { kind: 'visual-new'; id: string; name?: string; stackOrder: number; index?: number };

export interface MoveVisualDocumentClipInput {
  document: EditorDocumentV2;
  clipId: string;
  atSec: number;
  target: VisualDocumentMoveTarget;
  /** When present, preserve every primary clip and compact them from frame zero in this exact order.
   * This also packs the remaining primary clips when the moved clip leaves that lane. */
  primaryOrder?: readonly string[];
  /** a professional NLE removes an emptied non-primary lane after a move. */
  pruneEmptySourceTrack?: boolean;
}

export type MoveVisualDocumentClipResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[]; clipId: string; assetId: string }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  path?: string,
): Extract<MoveVisualDocumentClipResult, { ok: false }> {
  return { ok: false, document, error: { code, message, ...(path ? { path } : {}) } };
}

function visualClip(document: EditorDocumentV2, clipId: string) {
  for (const track of document.timeline.tracks) {
    if (!isVisualEditorTrack(track)) continue;
    const clip = track.clips.find((candidate): candidate is NarrativeTimelineClip | MediaTimelineClip => (
      candidate.id === clipId && (candidate.kind === 'narrative' || candidate.kind === 'media')
    ));
    if (clip) return { track, clip };
  }
  return null;
}

function asMediaClip(clip: NarrativeTimelineClip | MediaTimelineClip): MediaTimelineClip {
  if (clip.kind === 'media') return clip;
  const video: MediaVideoProperties = {
    treatment: clip.properties.treatment ?? 'full',
    ...(clip.properties.treatSize != null ? { treatSize: clip.properties.treatSize } : {}),
    ...(clip.properties.treatCrop != null ? { treatCrop: clip.properties.treatCrop } : {}),
    ...(clip.properties.preciseFraming ? { preciseFraming: clip.properties.preciseFraming } : {}),
    ...(clip.properties.filter ? { filter: clip.properties.filter } : {}),
    ...(clip.properties.volumeDb != null ? { volumeDb: clip.properties.volumeDb } : {}),
    ...(clip.properties.audioMuted ? { audioMuted: true } : {}),
    ...(clip.properties.audioFadeInSec ? { audioFadeInSec: clip.properties.audioFadeInSec } : {}),
    ...(clip.properties.audioFadeOutSec ? { audioFadeOutSec: clip.properties.audioFadeOutSec } : {}),
  };
  return {
    id: clip.id,
    kind: 'media',
    assetId: clip.assetId,
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    enabled: clip.enabled,
    ...(clip.linkGroupId ? { linkGroupId: clip.linkGroupId } : {}),
    sourceInSec: clip.sourceInSec,
    sourceOutSec: clip.sourceOutSec,
    fit: 'cover',
    ...(clip.box ? { box: clip.box } : {}),
    ...(clip.mediaFraming ? { mediaFraming: clip.mediaFraming } : {}),
    video,
  };
}

function asNarrativeClip(clip: NarrativeTimelineClip | MediaTimelineClip): NarrativeTimelineClip {
  if (clip.kind === 'narrative') return clip;
  return {
    id: clip.id,
    kind: 'narrative',
    assetId: clip.assetId,
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    enabled: clip.enabled,
    ...(clip.linkGroupId ? { linkGroupId: clip.linkGroupId } : {}),
    sourceInSec: clip.sourceInSec,
    sourceOutSec: clip.sourceOutSec,
    ...(clip.box ? { box: clip.box } : {}),
    ...(clip.mediaFraming ? { mediaFraming: clip.mediaFraming } : {}),
    properties: { treatment: 'full', ...(clip.video ?? {}) },
  };
}

function sceneIdFor(document: EditorDocumentV2, clipId: string): string {
  const used = new Set(document.semantics.scenes.map((scene) => scene.id));
  const stem = `scene_${clipId.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'clip'}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

/**
 * Move one visual clip exactly like a professional NLE's timeline transaction:
 *
 * 1. move the clip and linked companions by one time delta;
 * 2. clear only the occupied range on the destination visual lane (trim/split/remove);
 * 3. re-home the lead clip, converting between semantic-primary and ordinary media when needed;
 * 4. prune an emptied non-primary source lane and relay managed captions.
 */
export function moveVisualDocumentClip(input: MoveVisualDocumentClipInput): MoveVisualDocumentClipResult {
  if (!input.clipId.trim()) return failure(input.document, 'invalid-command', 'Visual clip id is required.', 'clipId');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) {
    return failure(input.document, 'invalid-range', 'Visual move time must be non-negative.', 'atSec');
  }
  const found = visualClip(input.document, input.clipId);
  if (!found) return failure(input.document, 'clip-not-found', `Visual clip does not exist: ${input.clipId}`, 'clipId');

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  let targetTrackId: string;
  if (input.target.kind === 'primary') {
    targetTrackId = document.semantics.primaryNarrativeTrackId;
  } else if (input.target.kind === 'visual') {
    targetTrackId = input.target.trackId;
  } else {
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      ...(input.target.index != null ? { index: input.target.index } : {}),
      track: {
        id: input.target.id,
        type: 'visual',
        role: 'broll',
        ...(input.target.name ? { name: input.target.name } : {}),
        stackOrder: input.target.stackOrder,
        syncLocked: true,
      },
    });
    if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
    document = inserted.document;
    receipts.push(inserted.receipt);
    targetTrackId = input.target.id;
  }

  const target = document.timeline.tracks.find((track) => track.id === targetTrackId);
  if (!target || !isVisualEditorTrack(target)) {
    return failure(input.document, target ? 'invalid-command' : 'track-not-found', `Visual target track does not exist: ${targetTrackId}`, 'target');
  }
  if (target.locked) return failure(input.document, 'track-locked', `Visual target track is locked: ${target.id}`);
  const asset = document.assets[found.clip.assetId];
  if (target.id === document.semantics.primaryNarrativeTrackId && asset?.kind !== 'video') {
    return failure(input.document, 'invalid-command', 'Only video clips can move to the primary narrative track.', 'target');
  }

  const moved = applyEditorCommand(document, {
    type: 'clip.move',
    trackId: found.track.id,
    clipId: found.clip.id,
    startFrame: secondsToTimelineFrames(input.atSec, document.canvas.fps),
    includeLinked: true,
  });
  if (!moved.ok) return { ok: false, document: input.document, error: moved.error };
  receipts.push(moved.receipt);
  const movedFound = visualClip(moved.document, found.clip.id);
  if (!movedFound) return failure(input.document, 'clip-not-found', `Moved visual clip disappeared: ${found.clip.id}`, 'clipId');

  const placed = target.id === moved.document.semantics.primaryNarrativeTrackId
    ? asNarrativeClip(movedFound.clip)
    : asMediaClip(movedFound.clip);
  const rangeStart = placed.startFrame;
  const rangeEnd = placed.startFrame + placed.durationFrames;
  const usedIds = new Set(moved.document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const removedClipIds = new Set<string>();
  const createdClipIds: string[] = [];
  const splitPairs = new Map<string, string[]>();

  const packPrimary = input.primaryOrder != null;
  const preservePrimaryDestination = packPrimary && target.id === moved.document.semantics.primaryNarrativeTrackId;
  let tracks = moved.document.timeline.tracks.map((track) => {
    if (track.id !== movedFound.track.id && track.id !== target.id) return track;
    const withoutLead = track.clips.filter((clip) => clip.id !== placed.id);
    if (track.id !== target.id) return { ...track, clips: withoutLead };
    if (preservePrimaryDestination) return { ...track, clips: [...withoutLead, placed] };
    const cleared = withoutLead.flatMap((clip): TimelineClip[] => {
      const edit = clearRangeFromClip(clip, rangeStart, rangeEnd, moved.document.canvas.fps, usedIds);
      edit.removedClipIds.forEach((id) => removedClipIds.add(id));
      createdClipIds.push(...edit.createdClipIds);
      for (const [originalId, rightId] of edit.splitPairs) {
        splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
      }
      return edit.clips;
    });
    return { ...track, clips: [...cleared, placed].sort((left, right) => left.startFrame - right.startFrame) };
  });

  const packedClipIds = new Set<string>();
  if (packPrimary) {
    const primary = tracks.find((track) => track.id === moved.document.semantics.primaryNarrativeTrackId)!;
    const clips = primary.clips.filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative');
    const requested = [...input.primaryOrder!];
    const byId = new Map(clips.map((clip) => [clip.id, clip] as const));
    if (clips.length !== primary.clips.length
      || requested.length !== clips.length
      || new Set(requested).size !== requested.length
      || requested.some((id) => !byId.has(id))) {
      return failure(input.document, 'invalid-command', 'Packed primary order must contain every primary clip exactly once.', 'primaryOrder');
    }
    let cursor = 0;
    const packed = requested.map((id) => {
      const clip = byId.get(id)!;
      if (clip.startFrame !== cursor) packedClipIds.add(id);
      const next = clip.startFrame === cursor ? clip : { ...clip, startFrame: cursor };
      cursor += clip.durationFrames;
      return next;
    });
    tracks = tracks.map((track) => track.id === primary.id ? { ...track, clips: packed } : track);
  }

  const survivingIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const detached = detachDanglingClipAnchors(tracks, survivingIds);
  if (detached.lockedTrackIds.length) {
    return failure(input.document, 'track-locked', `Moving the visual clip would detach anchors on locked track(s): ${detached.lockedTrackIds.join(', ')}`);
  }
  tracks = detached.tracks;
  let semantics: EditorDocumentV2['semantics'] = {
    ...moved.document.semantics,
    scenes: updateScenesForClipChanges(moved.document.semantics.scenes, removedClipIds, splitPairs),
  };
  if (target.id === moved.document.semantics.primaryNarrativeTrackId
    && !semantics.scenes.some((scene) => scene.clipIds.includes(placed.id))) {
    semantics = {
      ...semantics,
      scenes: [...semantics.scenes, { id: sceneIdFor(moved.document, placed.id), clipIds: [placed.id] }],
    };
  }
  if (semantics.managedCaptionSource?.mode === 'clip' && removedClipIds.has(semantics.managedCaptionSource.clipId)) {
    semantics = { ...semantics, managedCaptionSource: { mode: 'auto' } };
  }

  let converted: EditorDocumentV2 = { ...moved.document, timeline: { ...moved.document.timeline, tracks }, semantics };
  let removedTrackIds: string[] = [];
  if (input.pruneEmptySourceTrack ?? true) {
    const pruned = pruneEmptyNonPrimaryTracks(converted);
    converted = pruned.document;
    removedTrackIds = pruned.removedTrackIds;
  }
  const issue = validateEditorDocumentV2(converted).find((candidate) => candidate.severity === 'error');
  if (issue) return failure(input.document, 'invalid-command', issue.message, issue.path);
  const captions = applyEditorCommand(converted, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [...receipts.slice(0, -1), {
      ...moved.receipt,
      affectedTrackIds: [...new Set([...moved.receipt.affectedTrackIds, target.id, ...detached.changedTrackIds, ...removedTrackIds])],
      removedTrackIds: [...new Set([...moved.receipt.removedTrackIds, ...removedTrackIds])],
      removedClipIds: [...new Set([...moved.receipt.removedClipIds, ...removedClipIds])],
      createdClipIds: [...new Set([...moved.receipt.createdClipIds, ...createdClipIds])],
      shiftedClipIds: [...new Set([...moved.receipt.shiftedClipIds, ...packedClipIds])],
    }, captions.receipt],
    clipId: placed.id,
    assetId: placed.assetId,
  };
}
