import {
  SHOT_TREATMENTS,
  patchShotAudio,
  patchShotFraming,
  shotFilterCss,
  treatmentVacancyBox,
  type VideoShot,
} from '../../composition-core';
import type {
  EditorDocumentV2,
  EditorTrack,
  NarrativeTimelineClip,
  TimelineClip,
} from '../types';
import { validateEditorDocumentV2 } from '../validation';
import {
  commandFailure,
  emptyCommandReceipt,
  type EditorCommandResult,
  type NarrativeClipPatch,
  type NarrativeClipPatchUpdate,
} from './types';

const TREATMENTS = new Set(SHOT_TREATMENTS.map((item) => item.id));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function narrativeShot(clip: NarrativeTimelineClip): VideoShot {
  return {
    id: clip.id,
    srcStart: clip.sourceInSec,
    srcEnd: clip.sourceOutSec,
    ...clip.properties,
  };
}

function narrativeProperties(shot: VideoShot): NarrativeTimelineClip['properties'] {
  const { id: _id, srcStart: _sourceIn, srcEnd: _sourceOut, src: _src, srcSig: _srcSig, ...properties } = shot;
  return properties;
}

function validatePatch(patch: NarrativeClipPatch): string | null {
  if (!('framing' in patch) && !('partnerBlockId' in patch) && !('filter' in patch) && !('audio' in patch)) return 'Narrative patch is empty.';
  if ('framing' in patch) {
    if (!patch.framing || typeof patch.framing !== 'object' || Array.isArray(patch.framing)) return 'framing must be an object.';
    const framing = patch.framing;
    if (!Object.keys(framing).length) return 'Shot framing patch is empty.';
    if (framing.treatment != null && !TREATMENTS.has(framing.treatment)) return `Invalid shot treatment: ${framing.treatment}`;
    if (framing.coordinateSpace != null && framing.coordinateSpace !== 'source-normalized') return `Invalid framing coordinate space: ${framing.coordinateSpace}`;
    if (framing.resetPrecision != null && typeof framing.resetPrecision !== 'boolean') return 'resetPrecision must be a boolean.';
    for (const key of ['size', 'crop', 'scale', 'anchorX', 'anchorY'] as const) {
      if (framing[key] != null && !finite(framing[key])) return `${key} must be a finite number.`;
    }
    const treatment = framing.treatment;
    if ((framing.scale != null || framing.anchorX != null || framing.anchorY != null)
      && treatment != null && treatment !== 'full' && treatment !== 'punch-in') {
      return 'Precise framing is valid only for full or punch-in treatment.';
    }
  }
  if ('partnerBlockId' in patch && patch.partnerBlockId != null
    && (typeof patch.partnerBlockId !== 'string' || !patch.partnerBlockId.trim())) {
    return 'partnerBlockId must be a non-empty string or null.';
  }
  if ('filter' in patch && patch.filter != null) {
    if (typeof patch.filter !== 'object' || Array.isArray(patch.filter)) return 'filter must be an object or null.';
    for (const key of ['brightness', 'contrast', 'saturate'] as const) {
      if (patch.filter[key] != null && !finite(patch.filter[key])) return `${key} must be a finite number.`;
    }
  }
  if ('audio' in patch) {
    if (!patch.audio || typeof patch.audio !== 'object' || Array.isArray(patch.audio)) return 'audio must be an object.';
    if (!Object.keys(patch.audio).length) return 'Shot audio patch is empty.';
    for (const key of ['volumeDb', 'fadeInSec', 'fadeOutSec'] as const) {
      if (patch.audio[key] != null && !finite(patch.audio[key])) return `${key} must be a finite number.`;
    }
    if (patch.audio.mute != null && typeof patch.audio.mute !== 'boolean') return 'mute must be a boolean.';
  }
  return null;
}

function patchedNarrativeClip(clip: NarrativeTimelineClip, patch: NarrativeClipPatch): NarrativeTimelineClip {
  let shot = narrativeShot(clip);
  if (patch.framing) shot = patchShotFraming(shot, patch.framing);
  if ('partnerBlockId' in patch) {
    if (patch.partnerBlockId == null) delete shot.partnerBlockId;
    else shot.partnerBlockId = patch.partnerBlockId;
  }
  if ('filter' in patch) {
    const { filter: _filter, ...withoutFilter } = shot;
    shot = patch.filter && shotFilterCss(patch.filter) !== 'none'
      ? { ...withoutFilter, filter: patch.filter }
      : withoutFilter as VideoShot;
  }
  if (patch.audio) shot = patchShotAudio(shot, patch.audio);
  return { ...clip, properties: narrativeProperties(shot) };
}

interface ResolvedUpdate {
  track: EditorTrack;
  clip: NarrativeTimelineClip;
  next: NarrativeTimelineClip;
  patch: NarrativeClipPatch;
}

function patchPartnerBlock(clip: TimelineClip, narrative: NarrativeTimelineClip): TimelineClip {
  if (clip.kind !== 'graphic' && clip.kind !== 'caption') return clip;
  const vacancy = treatmentVacancyBox(narrative.properties.treatment, narrative.properties.treatSize);
  if (!vacancy) return clip;
  return {
    ...clip,
    startFrame: narrative.startFrame,
    durationFrames: narrative.durationFrames,
    block: { ...clip.block, box: vacancy },
  };
}

/** Applies normalized visual/audio property edits without exposing timeline geometry or asset identity. */
export function patchNarrativeClips(
  document: EditorDocumentV2,
  updates: readonly NarrativeClipPatchUpdate[],
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!updates.length) return commandFailure(document, 'invalid-command', 'At least one narrative patch is required.', { path: 'updates' });

  const clipLocations = new Map(document.timeline.tracks.flatMap((track) =>
    track.clips.map((clip) => [clip.id, { track, clip }] as const),
  ));
  const seen = new Set<string>();
  const resolved: ResolvedUpdate[] = [];
  for (const [index, update] of updates.entries()) {
    if (seen.has(update.clipId)) {
      return commandFailure(document, 'invalid-command', `Narrative clip is targeted more than once: ${update.clipId}`, { path: `updates[${index}].clipId` });
    }
    seen.add(update.clipId);
    const found = clipLocations.get(update.clipId);
    if (!found) return commandFailure(document, 'clip-not-found', `Clip does not exist: ${update.clipId}`, { path: `updates[${index}].clipId` });
    if (found.clip.kind !== 'narrative') {
      return commandFailure(document, 'invalid-command', `Clip is not narrative: ${update.clipId}`, { path: `updates[${index}].clipId`, trackIds: [found.track.id] });
    }
    const patchError = validatePatch(update.patch);
    if (patchError) return commandFailure(document, 'invalid-command', patchError, { path: `updates[${index}].patch`, trackIds: [found.track.id] });
    if (update.patch.partnerBlockId) {
      const partner = clipLocations.get(update.patch.partnerBlockId);
      if (!partner) {
        return commandFailure(document, 'clip-not-found', `Partner overlay does not exist: ${update.patch.partnerBlockId}`, {
          path: `updates[${index}].patch.partnerBlockId`,
        });
      }
      if (partner.clip.kind !== 'graphic' && partner.clip.kind !== 'caption') {
        return commandFailure(document, 'invalid-command', `Partner clip is not an overlay: ${update.patch.partnerBlockId}`, {
          path: `updates[${index}].patch.partnerBlockId`,
          trackIds: [partner.track.id],
        });
      }
    }
    const next = patchedNarrativeClip(found.clip, update.patch);
    const resolvedTreatment = next.properties.treatment;
    if ((update.patch.framing?.scale != null || update.patch.framing?.anchorX != null || update.patch.framing?.anchorY != null)
      && resolvedTreatment !== 'full' && resolvedTreatment !== 'punch-in') {
      return commandFailure(document, 'invalid-command', 'Precise framing is valid only for full or punch-in treatment.', { path: `updates[${index}].patch.framing` });
    }
    resolved.push({ track: found.track, clip: found.clip, next, patch: update.patch });
  }

  const partnerNarrative = new Map<string, NarrativeTimelineClip>();
  for (const update of resolved) {
    const partnerId = update.patch.framing || 'partnerBlockId' in update.patch
      ? update.next.properties.partnerBlockId
      : undefined;
    if (partnerId && treatmentVacancyBox(update.next.properties.treatment, update.next.properties.treatSize)) {
      partnerNarrative.set(partnerId, update.next);
    }
  }
  const affectedTrackIds = new Set(resolved.map((update) => update.track.id));
  for (const track of document.timeline.tracks) {
    if (track.clips.some((clip) => partnerNarrative.has(clip.id))) affectedTrackIds.add(track.id);
  }
  const lockedTrackIds = document.timeline.tracks
    .filter((track) => affectedTrackIds.has(track.id) && track.locked)
    .map((track) => track.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Narrative patch touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }

  const nextById = new Map(resolved.map((update) => [update.clip.id, update.next]));
  const tracks = document.timeline.tracks.map((track): EditorTrack => {
    if (!affectedTrackIds.has(track.id)) return track;
    return {
      ...track,
      clips: track.clips.map((clip) => {
        const narrative = nextById.get(clip.id);
        if (narrative) return narrative;
        const partner = partnerNarrative.get(clip.id);
        return partner ? patchPartnerBlock(clip, partner) : clip;
      }),
    };
  });
  const next: EditorDocumentV2 = { ...document, timeline: { ...document.timeline, tracks } };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('narrative.patch');
  receipt.affectedTrackIds = [...affectedTrackIds];
  return { ok: true, document: next, receipt };
}
