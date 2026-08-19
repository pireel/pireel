import { directorPlanAfterRippleInsertion, directorPlanAfterRippleRemoval, withAdjustedDirectorPlan } from '../../director-plan-timing';
import {
  directorPlanFromDocument,
  withoutDirectorPlanInSemantics,
} from '../../director-plan-artifact';
import type { EditorDocumentV2, EditorTrack, MediaTimelineClip, TimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

export interface RetimeEditorClipOptions {
  trackId: string;
  clipId: string;
  durationFrames: number;
  /** Move clips beginning after this clip's old out-point by the duration delta. */
  ripple?: boolean;
}

function retimedMediaKeyframes(clip: MediaTimelineClip, durationFrames: number): MediaTimelineClip['keyframes'] {
  if (!clip.keyframes || durationFrames === clip.durationFrames) return clip.keyframes;
  const mapFrame = (frame: number) => Math.max(0, Math.min(durationFrames, Math.round(frame * durationFrames / clip.durationFrames)));
  return {
    ...(clip.keyframes.box ? { box: clip.keyframes.box.map((row) => ({ ...row, frame: mapFrame(row.frame) })) } : {}),
    ...(clip.keyframes.opacity ? { opacity: clip.keyframes.opacity.map((row) => ({ ...row, frame: mapFrame(row.frame) })) } : {}),
  };
}

function withDuration(clip: TimelineClip, durationFrames: number): TimelineClip {
  if (clip.kind !== 'media') return { ...clip, durationFrames };
  return { ...clip, durationFrames, keyframes: retimedMediaKeyframes(clip, durationFrames) };
}

/**
 * Change a video clip's timeline duration while keeping its source interval fixed. Preview and
 * export derive playback speed from source duration / timeline duration, so no duplicate speed
 * state is persisted. Optional ripple only moves clips that begin at/after the old out-point;
 * material already overlapping the retimed clip is deliberately left untouched.
 */
export function retimeEditorClip(document: EditorDocumentV2, options: RetimeEditorClipOptions): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!Number.isInteger(options.durationFrames) || options.durationFrames <= 0) {
    return commandFailure(document, 'invalid-range', 'Retimed duration must be a positive integral frame count.', { path: 'durationFrames' });
  }
  const track = document.timeline.tracks.find((candidate) => candidate.id === options.trackId);
  if (!track) return commandFailure(document, 'track-not-found', `Track does not exist: ${options.trackId}`, { trackIds: [options.trackId] });
  const target = track.clips.find((candidate) => candidate.id === options.clipId);
  if (!target) return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${options.trackId}: ${options.clipId}`, { trackIds: [options.trackId] });
  if ((target.kind !== 'narrative' && target.kind !== 'media') || document.assets[target.assetId]?.kind !== 'video') {
    return commandFailure(document, 'invalid-command', `Clip is not video media: ${options.clipId}`, { path: 'clipId', trackIds: [options.trackId] });
  }
  if (target.durationFrames === options.durationFrames) {
    return { ok: true, document, receipt: emptyCommandReceipt('clip.retime') };
  }

  const ripple = options.ripple === true;
  const oldEndFrame = target.startFrame + target.durationFrames;
  const deltaFrames = options.durationFrames - target.durationFrames;
  const affectedTrackIds = new Set<string>([track.id]);
  if (ripple) {
    for (const candidate of document.timeline.tracks) {
      if (candidate.syncLocked && candidate.clips.some((clip) => clip.startFrame >= oldEndFrame)) affectedTrackIds.add(candidate.id);
    }
  }
  const lockedTrackIds = document.timeline.tracks
    .filter((candidate) => affectedTrackIds.has(candidate.id) && candidate.locked)
    .map((candidate) => candidate.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Clip retime touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }

  const shiftedClipIds: string[] = [];
  const tracks = document.timeline.tracks.map((candidate): EditorTrack => {
    if (!affectedTrackIds.has(candidate.id)) return candidate;
    const clips = candidate.clips.map((clip) => {
      if (clip.id === target.id) return withDuration(clip, options.durationFrames);
      if (!ripple || clip.startFrame < oldEndFrame) return clip;
      shiftedClipIds.push(clip.id);
      return { ...clip, startFrame: clip.startFrame + deltaFrames };
    }).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
    return { ...candidate, clips };
  });

  let semantics = { ...document.semantics };
  delete semantics.plan;
  const directorPlan = directorPlanFromDocument(document);
  if (target.kind === 'narrative' && directorPlan) {
    if (!ripple) {
      semantics = withoutDirectorPlanInSemantics(semantics);
    } else if (deltaFrames > 0) {
      const sceneId = document.semantics.scenes.find((scene) => scene.clipIds.includes(target.id))?.id
        ?? directorPlan.scenes.find((scene) => (
          target.startFrame >= scene.startFrame && target.startFrame < scene.startFrame + scene.durationFrames
        ))?.id;
      const adjusted = directorPlanAfterRippleInsertion(directorPlan, oldEndFrame, deltaFrames, sceneId);
      if (!adjusted.ok) return commandFailure(document, 'invalid-command', adjusted.error, { path: 'semantics.artifacts.directorPlan' });
      semantics = withAdjustedDirectorPlan(semantics, adjusted.plan);
    } else {
      semantics = withAdjustedDirectorPlan(
        semantics,
        directorPlanAfterRippleRemoval(directorPlan, oldEndFrame + deltaFrames, oldEndFrame),
      );
    }
  }

  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks }, semantics };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('clip.retime');
  receipt.affectedTrackIds = [...affectedTrackIds];
  receipt.shiftedClipIds = shiftedClipIds;
  return { ok: true, document: next, receipt };
}
