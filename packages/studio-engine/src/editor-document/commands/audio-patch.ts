import {
  AUDIO_FADE_MAX_SEC,
  AUDIO_SPEED_MAX,
  AUDIO_SPEED_MIN,
} from '../../audio-tracks';
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from '../../composition-core';
import type { AudioTimelineClip, EditorDocumentV2, EditorTrack, TimelineClip } from '../types';
import { positiveDurationFrames } from '../time';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type AudioTimelineClipPatchUpdate, type EditorCommandResult } from './types';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function audioTimelineStateError(patch: AudioTimelineClipPatchUpdate['patch'], fps: number): string | null {
  if (!Number.isInteger(patch.startFrame) || patch.startFrame < 0) return 'Audio startFrame must be a non-negative integer.';
  if (!Number.isInteger(patch.durationFrames) || patch.durationFrames <= 0) return 'Audio durationFrames must be a positive integer.';
  if (!finite(patch.sourceInSec) || patch.sourceInSec < 0) return 'Audio sourceInSec must be non-negative.';
  if (patch.sourceOutSec != null && (!finite(patch.sourceOutSec) || patch.sourceOutSec <= patch.sourceInSec)) {
    return 'Audio sourceOutSec must be greater than sourceInSec.';
  }
  const { volumeDb, fadeInSec, fadeOutSec, speed, muted } = patch.properties;
  if (volumeDb != null && (!finite(volumeDb) || volumeDb < VOLUME_DB_MIN || volumeDb > VOLUME_DB_MAX)) return 'Audio volumeDb is out of range.';
  for (const [name, value] of [['fadeInSec', fadeInSec], ['fadeOutSec', fadeOutSec]] as const) {
    if (value != null && (!finite(value) || value < 0 || value > AUDIO_FADE_MAX_SEC)) return `Audio ${name} is out of range.`;
  }
  if (speed != null && (!finite(speed) || speed < AUDIO_SPEED_MIN || speed > AUDIO_SPEED_MAX)) return 'Audio speed is out of range.';
  if (muted != null && typeof muted !== 'boolean') return 'Audio muted must be boolean.';
  if (patch.sourceOutSec != null) {
    const expected = positiveDurationFrames((patch.sourceOutSec - patch.sourceInSec) / (speed ?? 1), fps);
    if (expected !== patch.durationFrames) return 'Audio durationFrames does not match its source range and speed.';
  }
  return null;
}

function isAudioClip(clip: TimelineClip): clip is AudioTimelineClip {
  return clip.kind === 'audio';
}

/** Replace coupled audio geometry/source/envelope state by stable identity as one atomic batch. */
export function patchAudioClips(document: EditorDocumentV2, updates: readonly AudioTimelineClipPatchUpdate[]): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!updates.length) return commandFailure(document, 'invalid-command', 'At least one audio patch is required.', { path: 'updates' });
  const locations = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, { track, clip }] as const)));
  const seen = new Set<string>();
  const nextById = new Map<string, AudioTimelineClip>();
  const trackIds = new Set<string>();
  for (const [index, update] of updates.entries()) {
    if (seen.has(update.clipId)) return commandFailure(document, 'invalid-command', `Audio clip is targeted more than once: ${update.clipId}`, { path: `updates[${index}].clipId` });
    seen.add(update.clipId);
    const found = locations.get(update.clipId);
    if (!found) return commandFailure(document, 'clip-not-found', `Clip does not exist: ${update.clipId}`, { path: `updates[${index}].clipId` });
    if (!isAudioClip(found.clip)) return commandFailure(document, 'invalid-command', `Clip is not audio: ${update.clipId}`, { path: `updates[${index}].clipId`, trackIds: [found.track.id] });
    const invalid = audioTimelineStateError(update.patch, document.canvas.fps);
    if (invalid) return commandFailure(document, 'invalid-command', invalid, { path: `updates[${index}].patch`, trackIds: [found.track.id] });
    trackIds.add(found.track.id);
    const { sourceOutSec, ...patch } = update.patch;
    const next: AudioTimelineClip = { ...found.clip, ...patch };
    if (sourceOutSec == null) delete next.sourceOutSec;
    else next.sourceOutSec = sourceOutSec;
    nextById.set(update.clipId, next);
  }
  const locked = document.timeline.tracks.filter((track) => trackIds.has(track.id) && track.locked).map((track) => track.id);
  if (locked.length) return commandFailure(document, 'track-locked', `Audio patch touches locked track(s): ${locked.join(', ')}`, { trackIds: locked });
  const tracks = document.timeline.tracks.map((track): EditorTrack => trackIds.has(track.id)
    ? { ...track, clips: track.clips.map((clip) => nextById.get(clip.id) ?? clip) }
    : track);
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks } };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('audio.patch');
  receipt.affectedTrackIds = [...trackIds];
  return { ok: true, document: next, receipt };
}
