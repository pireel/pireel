import type { EditorDocumentV2, EditorTrack, SemanticScene, TimelineClip } from '../types';
import { atomicMediaFramingFromTreatment, IDENTITY_MEDIA_FRAMING } from '../../composition-core';
import { validateEditorDocumentV2 } from '../validation';
import { clipEndFrame, splitClipAtFrame } from './clip-geometry';
import { removeEditorRange } from './range';
import { directorPlanAfterRippleInsertion, withAdjustedDirectorPlan } from '../../director-plan-timing';
import { assignClipToBestDirectorScene, assignClipToSemanticScene } from '../../semantic-scenes';
import {
  commandFailure,
  emptyCommandReceipt,
  type EditorCommandResult,
  type TimelineClipPlacement,
} from './types';

export interface InsertEditorClipsOptions {
  trackId: string;
  atFrame: number;
  clips: TimelineClipPlacement[];
  mode: 'overwrite' | 'ripple';
  includeLinked?: boolean;
  sceneId?: string;
}

function assignInsertedClips(
  original: EditorDocumentV2,
  document: EditorDocumentV2,
  clipIds: readonly string[],
  sceneId?: string,
): EditorDocumentV2 | EditorCommandResult {
  let next = document;
  for (const clipId of clipIds) {
    const assigned = sceneId
      ? assignClipToSemanticScene(next, clipId, sceneId)
      : assignClipToBestDirectorScene(next, clipId);
    if (!assigned.ok) return commandFailure(original, 'invalid-command', assigned.error, { path: 'sceneId' });
    next = assigned.document;
  }
  return next;
}

function placedClips(placements: TimelineClipPlacement[], atFrame: number): TimelineClip[] {
  return placements.map((placement) => {
    const { offsetFrames, ...clip } = placement;
    const mediaFraming = clip.kind === 'narrative'
      ? clip.mediaFraming ?? atomicMediaFramingFromTreatment(
          clip.properties.treatment ?? 'full',
          clip.properties.treatSize,
          clip.properties.treatCrop,
          clip.properties.preciseFraming,
        )
      : clip.kind === 'media'
        ? clip.mediaFraming ?? IDENTITY_MEDIA_FRAMING
        : undefined;
    return {
      ...clip,
      ...(mediaFraming ? { mediaFraming } : {}),
      startFrame: atFrame + offsetFrames,
    } as TimelineClip;
  });
}

function insertionTrackIds(
  document: EditorDocumentV2,
  targetTrackId: string,
  atFrame: number,
  includeLinked: boolean,
): Set<string> {
  const trackIds = new Set<string>([targetTrackId]);
  for (const track of document.timeline.tracks) if (track.syncLocked) trackIds.add(track.id);
  if (!includeLinked) return trackIds;

  const linkGroupIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const track of document.timeline.tracks) {
      if (!trackIds.has(track.id)) continue;
      for (const clip of track.clips) {
        if (clip.linkGroupId && clipEndFrame(clip) > atFrame && !linkGroupIds.has(clip.linkGroupId)) {
          linkGroupIds.add(clip.linkGroupId);
          changed = true;
        }
      }
    }
    for (const track of document.timeline.tracks) {
      if (trackIds.has(track.id)) continue;
      if (track.clips.some((clip) => clip.linkGroupId && linkGroupIds.has(clip.linkGroupId))) {
        trackIds.add(track.id);
        changed = true;
      }
    }
  }
  return trackIds;
}

function expandScenesForSplits(scenes: SemanticScene[], splitPairs: Map<string, string[]>): SemanticScene[] {
  if (!splitPairs.size) return scenes;
  return scenes.map((scene) => ({
    ...scene,
    clipIds: scene.clipIds.flatMap((clipId) => [clipId, ...(splitPairs.get(clipId) ?? [])]),
  }));
}

function validateInsertInput(
  document: EditorDocumentV2,
  options: InsertEditorClipsOptions,
): EditorCommandResult | { targetTrack: EditorTrack; clips: TimelineClip[]; spanFrames: number } {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!Number.isInteger(options.atFrame) || options.atFrame < 0) {
    return commandFailure(document, 'invalid-range', 'Insertion frame must be a non-negative integer.', { path: 'atFrame' });
  }
  const targetTrack = document.timeline.tracks.find((track) => track.id === options.trackId);
  if (!targetTrack) return commandFailure(document, 'track-not-found', `Track does not exist: ${options.trackId}`, { trackIds: [options.trackId] });
  if (targetTrack.locked) return commandFailure(document, 'track-locked', `Track is locked: ${options.trackId}`, { trackIds: [options.trackId] });
  if (!options.clips.length) return commandFailure(document, 'invalid-command', 'At least one clip placement is required.', { path: 'clips' });

  const existingIds = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const incomingIds = new Set<string>();
  for (const [index, clip] of options.clips.entries()) {
    if (!Number.isInteger(clip.offsetFrames) || clip.offsetFrames < 0) {
      return commandFailure(document, 'invalid-range', 'Clip offsets must be non-negative integral frames.', { path: `clips[${index}].offsetFrames` });
    }
    if (!Number.isInteger(clip.durationFrames) || clip.durationFrames <= 0) {
      return commandFailure(document, 'invalid-range', 'Clip durations must be positive integral frames.', { path: `clips[${index}].durationFrames` });
    }
    if (existingIds.has(clip.id) || incomingIds.has(clip.id)) {
      return commandFailure(document, 'duplicate-clip-id', `Clip already exists: ${clip.id}`, { path: `clips[${index}].id` });
    }
    incomingIds.add(clip.id);
  }
  const clips = placedClips(options.clips, options.atFrame);
  const spanFrames = Math.max(...options.clips.map((clip) => clip.offsetFrames + clip.durationFrames));
  return { targetTrack, clips, spanFrames };
}

/** Opens or overwrites a timeline interval, then places one atomic group of relative clips. */
export function insertEditorClips(document: EditorDocumentV2, options: InsertEditorClipsOptions): EditorCommandResult {
  const checked = validateInsertInput(document, options);
  if ('ok' in checked) return checked;
  const { clips: incomingClips, spanFrames } = checked;

  if (options.mode === 'overwrite') {
    const cleared = removeEditorRange(document, {
      trackId: options.trackId,
      startFrame: options.atFrame,
      endFrame: options.atFrame + spanFrames,
      mode: 'lift',
      includeLinked: options.includeLinked,
      // The cleared lane is the destination for the replacement clips below. A range that fully
      // covers its current contents must not prune the lane between these atomic steps.
      pruneEmptyTracks: false,
    });
    if (!cleared.ok) return cleared;
    const targetIndex = cleared.document.timeline.tracks.findIndex((track) => track.id === options.trackId);
    const tracks = [...cleared.document.timeline.tracks];
    const target = tracks[targetIndex]!;
    tracks[targetIndex] = {
      ...target,
      clips: [...target.clips, ...incomingClips].sort((a, b) => a.startFrame - b.startFrame),
    };
    let next: EditorDocumentV2 = { ...cleared.document, timeline: { ...cleared.document.timeline, tracks } };
    const assigned = assignInsertedClips(document, next, incomingClips.map((clip) => clip.id), options.sceneId);
    if ('ok' in assigned) return assigned;
    next = assigned;
    const issue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
    if (issue) return commandFailure(document, 'invalid-command', issue.message, { path: issue.path });
    return {
      ok: true,
      document: next,
      receipt: {
        ...cleared.receipt,
        commandType: 'clips.insert',
        affectedTrackIds: [...new Set([...cleared.receipt.affectedTrackIds, options.trackId])],
        createdClipIds: [...cleared.receipt.createdClipIds, ...incomingClips.map((clip) => clip.id)],
      },
    };
  }

  const affectedTrackIds = insertionTrackIds(document, options.trackId, options.atFrame, options.includeLinked ?? true);
  const tracksToChange = document.timeline.tracks.filter((track) =>
    affectedTrackIds.has(track.id)
    && (track.id === options.trackId || track.clips.some((clip) => clipEndFrame(clip) > options.atFrame)),
  );
  const lockedTrackIds = tracksToChange.filter((track) => track.locked).map((track) => track.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Ripple insert touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }

  const usedIds = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  for (const clip of incomingClips) usedIds.add(clip.id);
  const splitCreatedIds: string[] = [];
  const shiftedClipIds: string[] = [];
  const changedTrackIds = new Set<string>();
  const splitPairs = new Map<string, string[]>();
  const tracks = document.timeline.tracks.map((track): EditorTrack => {
    if (!affectedTrackIds.has(track.id)) return track;
    const shouldInsert = track.id === options.trackId;
    const needsGeometryChange = track.clips.some((clip) => clipEndFrame(clip) > options.atFrame);
    if (!shouldInsert && !needsGeometryChange) return track;
    changedTrackIds.add(track.id);
    const clips = track.clips.flatMap((clip) => {
      const edit = splitClipAtFrame(clip, options.atFrame, document.canvas.fps, usedIds);
      splitCreatedIds.push(...edit.createdClipIds);
      for (const [originalId, rightId] of edit.splitPairs) {
        splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
      }
      return edit.clips;
    }).map((clip) => {
      if (clip.startFrame < options.atFrame) return clip;
      shiftedClipIds.push(clip.id);
      return { ...clip, startFrame: clip.startFrame + spanFrames };
    });
    if (shouldInsert) clips.push(...incomingClips);
    clips.sort((a, b) => a.startFrame - b.startFrame);
    return { ...track, clips };
  });
  let semantics: EditorDocumentV2['semantics'] = {
    ...document.semantics,
    scenes: expandScenesForSplits(document.semantics.scenes, splitPairs),
  };
  if (affectedTrackIds.has(document.semantics.primaryNarrativeTrackId) && document.semantics.directorPlan) {
    const adjusted = directorPlanAfterRippleInsertion(
      document.semantics.directorPlan,
      options.atFrame,
      spanFrames,
      options.sceneId,
    );
    if (!adjusted.ok) return commandFailure(document, 'invalid-command', adjusted.error, { path: 'sceneId' });
    semantics = withAdjustedDirectorPlan(semantics, adjusted.plan);
  }
  let next: EditorDocumentV2 = {
    ...document,
    timeline: { ...document.timeline, tracks },
    semantics,
  };
  const assigned = assignInsertedClips(document, next, incomingClips.map((clip) => clip.id), options.sceneId);
  if ('ok' in assigned) return assigned;
  next = assigned;
  const issue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-command', issue.message, { path: issue.path });

  const receipt = emptyCommandReceipt('clips.insert');
  receipt.affectedTrackIds = [...changedTrackIds];
  receipt.createdClipIds = [...splitCreatedIds, ...incomingClips.map((clip) => clip.id)];
  receipt.shiftedClipIds = shiftedClipIds;
  return { ok: true, document: next, receipt };
}
