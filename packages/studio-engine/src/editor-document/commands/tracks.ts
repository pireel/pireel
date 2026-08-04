import { validateEditorDocumentV2 } from '../validation';
import type { EditorDocumentV2, EditorTrack, EditorTrackRole, EditorTrackType, TimelineClip } from '../types';
import {
  commandFailure,
  emptyCommandReceipt,
  type EditorCommandResult,
  type InsertTrackInput,
  type TrackPatch,
} from './types';

const roleTrackTypes: Partial<Record<EditorTrackRole, EditorTrackType>> = {
  primaryNarrative: 'visual',
  broll: 'visual',
  graphics: 'graphics',
  music: 'audio',
  managedCaptions: 'caption',
};

function clipIds(document: EditorDocumentV2): Set<string> {
  return new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
}

function withTracks(document: EditorDocumentV2, tracks: EditorTrack[]): EditorDocumentV2 {
  return { ...document, timeline: { ...document.timeline, tracks } };
}

function invalidResult(document: EditorDocumentV2): EditorCommandResult | undefined {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (!issue) return undefined;
  return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
}

export function insertEditorTrack(
  document: EditorDocumentV2,
  input: InsertTrackInput,
  index?: number,
): EditorCommandResult {
  const invalid = invalidResult(document);
  if (invalid) return invalid;
  if (!input.id.trim()) return commandFailure(document, 'invalid-command', 'Track id must not be empty.', { path: 'track.id' });
  if (document.timeline.tracks.some((track) => track.id === input.id)) {
    return commandFailure(document, 'duplicate-track-id', `Track already exists: ${input.id}`, { path: 'track.id' });
  }
  if (input.role === 'primaryNarrative') {
    return commandFailure(document, 'invalid-track-role', 'The document already owns its required primary narrative track.', { path: 'track.role' });
  }
  const expectedType = input.role ? roleTrackTypes[input.role] : undefined;
  if (expectedType && expectedType !== input.type) {
    return commandFailure(document, 'invalid-track-role', `${input.role} requires a ${expectedType} track.`, { path: 'track.role' });
  }
  if (input.role === 'managedCaptions' && document.semantics.managedCaptionTrackId) {
    return commandFailure(document, 'invalid-track-role', 'Only one managed caption track is allowed.', { path: 'track.role' });
  }

  const existingClipIds = clipIds(document);
  const insertedClipIds = new Set<string>();
  for (const [clipIndex, clip] of (input.clips ?? []).entries()) {
    if (existingClipIds.has(clip.id) || insertedClipIds.has(clip.id)) {
      return commandFailure(document, 'duplicate-clip-id', `Clip already exists: ${clip.id}`, { path: `track.clips[${clipIndex}].id` });
    }
    insertedClipIds.add(clip.id);
  }

  const maxStackOrder = document.timeline.tracks.reduce((max, track) => Math.max(max, track.stackOrder), -1);
  const track: EditorTrack = {
    id: input.id,
    type: input.type,
    ...(input.role ? { role: input.role } : {}),
    ...(input.name ? { name: input.name } : {}),
    muted: input.muted ?? false,
    hidden: input.hidden ?? false,
    locked: input.locked ?? false,
    syncLocked: input.syncLocked ?? true,
    stackOrder: input.stackOrder ?? maxStackOrder + 1,
    clips: input.clips ? [...input.clips] : [],
  };
  const insertAt = index == null
    ? document.timeline.tracks.length
    : Math.min(document.timeline.tracks.length, Math.max(0, Math.trunc(index)));
  const tracks = [...document.timeline.tracks];
  tracks.splice(insertAt, 0, track);
  let next = withTracks(document, tracks);
  if (track.role === 'managedCaptions') {
    next = { ...next, semantics: { ...next.semantics, managedCaptionTrackId: track.id } };
  }
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });

  const receipt = emptyCommandReceipt('track.insert');
  receipt.affectedTrackIds = [track.id];
  receipt.createdClipIds = track.clips.map((clip) => clip.id);
  return { ok: true, document: next, receipt };
}

export function removeEditorTrack(document: EditorDocumentV2, trackId: string): EditorCommandResult {
  const invalid = invalidResult(document);
  if (invalid) return invalid;
  const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  if (track.id === document.semantics.primaryNarrativeTrackId || track.role === 'primaryNarrative') {
    return commandFailure(document, 'primary-track-required', 'The primary narrative lane may be empty, but the lane itself is required.', { trackIds: [trackId] });
  }
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });

  const removedClipIds = new Set(track.clips.map((clip) => clip.id));
  const dependentTrackIds = document.timeline.tracks
    .filter((candidate) => candidate.id !== trackId && candidate.clips.some((clip) =>
      'anchor' in clip && clip.anchor.type === 'clip' && removedClipIds.has(clip.anchor.clipId),
    ))
    .map((candidate) => candidate.id);
  const lockedDependentTrackIds = document.timeline.tracks
    .filter((candidate) => dependentTrackIds.includes(candidate.id) && candidate.locked)
    .map((candidate) => candidate.id);
  if (lockedDependentTrackIds.length) {
    return commandFailure(document, 'track-locked', `Removing the track would detach anchors on locked track(s): ${lockedDependentTrackIds.join(', ')}`, { trackIds: lockedDependentTrackIds });
  }

  const tracks = document.timeline.tracks
    .filter((candidate) => candidate.id !== trackId)
    .map((candidate): EditorTrack => {
      if (!dependentTrackIds.includes(candidate.id)) return candidate;
      return {
        ...candidate,
        clips: candidate.clips.map((clip): TimelineClip => {
          if (!('anchor' in clip) || clip.anchor.type !== 'clip' || !removedClipIds.has(clip.anchor.clipId)) return clip;
          return { ...clip, anchor: { type: 'timeline' } };
        }),
      };
    });
  let next = withTracks(document, tracks);
  next = {
    ...next,
    semantics: {
      ...next.semantics,
      scenes: next.semantics.scenes.map((scene) => ({
        ...scene,
        clipIds: scene.clipIds.filter((clipId) => !removedClipIds.has(clipId)),
      })),
    },
  };
  if (next.semantics.managedCaptionTrackId === trackId) {
    const { managedCaptionTrackId: _removed, ...semantics } = next.semantics;
    next = { ...next, semantics };
  }
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('track.remove');
  receipt.affectedTrackIds = [trackId, ...dependentTrackIds];
  receipt.removedTrackIds = [trackId];
  receipt.removedClipIds = [...removedClipIds];
  return { ok: true, document: next, receipt };
}

export function patchEditorTrack(document: EditorDocumentV2, trackId: string, patch: TrackPatch): EditorCommandResult {
  const invalid = invalidResult(document);
  if (invalid) return invalid;
  const trackIndex = document.timeline.tracks.findIndex((candidate) => candidate.id === trackId);
  if (trackIndex < 0) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });

  const current = document.timeline.tracks[trackIndex]!;
  const nextTrack: EditorTrack = { ...current, ...patch };
  const same = (Object.keys(patch) as (keyof TrackPatch)[]).every((key) => current[key] === nextTrack[key]);
  if (same) return { ok: true, document, receipt: emptyCommandReceipt('track.patch') };

  const tracks = [...document.timeline.tracks];
  tracks[trackIndex] = nextTrack;
  const next = withTracks(document, tracks);
  const receipt = emptyCommandReceipt('track.patch');
  receipt.affectedTrackIds = [trackId];
  return { ok: true, document: next, receipt };
}

/** Reorders lane presentation. Compositing remains explicit through stackOrder. */
export function moveEditorTrack(document: EditorDocumentV2, trackId: string, toIndex: number): EditorCommandResult {
  const invalid = invalidResult(document);
  if (invalid) return invalid;
  const fromIndex = document.timeline.tracks.findIndex((track) => track.id === trackId);
  if (fromIndex < 0) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= document.timeline.tracks.length) {
    return commandFailure(document, 'invalid-range', `Track index must be within 0..${Math.max(0, document.timeline.tracks.length - 1)}.`, { path: 'toIndex' });
  }
  if (document.timeline.tracks[fromIndex]!.locked) {
    return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });
  }
  if (fromIndex === toIndex) return { ok: true, document, receipt: emptyCommandReceipt('track.move') };

  const tracks = [...document.timeline.tracks];
  const [moved] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, moved!);
  const receipt = emptyCommandReceipt('track.move');
  receipt.affectedTrackIds = [trackId];
  return { ok: true, document: withTracks(document, tracks), receipt };
}
