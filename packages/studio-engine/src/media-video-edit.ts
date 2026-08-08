import {
  patchShotAudio,
  patchShotFraming,
  shotFilterCss,
  type ShotFilter,
  type ShotFramingPatch,
  type VideoShot,
} from './composition-core';
import {
  applyEditorCommand,
  patchNarrativeClips,
  type EditorDocumentV2,
  type MediaTimelineClip,
  type MediaVideoProperties,
} from './editor-document';

export interface MediaVideoSettingsPatch {
  framing?: ShotFramingPatch;
  filter?: ShotFilter | null;
  audio?: { volumeDb?: number; mute?: boolean; fadeInSec?: number; fadeOutSec?: number };
}

export type MediaVideoEditResult =
  | { ok: true; document: EditorDocumentV2; shot: VideoShot }
  | { ok: false; error: string; data?: unknown };

export interface MediaVideoClipEntry {
  trackId: string;
  clip: MediaTimelineClip;
  shot: VideoShot;
}

export interface VideoClipSettingsPatchUpdate {
  clipId: string;
  patch: MediaVideoSettingsPatch;
}

export type VideoClipSettingsBatchResult =
  | { ok: true; document: EditorDocumentV2 }
  | { ok: false; error: string; data?: unknown };

/** Adapt an ordinary multi-track video clip to the shot-settings surface without changing its kind. */
export function mediaTimelineClipAsVideoShot(clip: MediaTimelineClip): VideoShot {
  return {
    id: clip.id,
    srcStart: clip.sourceInSec,
    srcEnd: clip.sourceOutSec,
    treatment: clip.video?.treatment ?? 'full',
    ...(clip.video ?? {}),
    ...(clip.mediaFraming ? { mediaFraming: clip.mediaFraming } : {}),
  };
}

/** Video clips on every ordinary visual lane, in stable document order. */
export function mediaVideoClipEntries(document: EditorDocumentV2): MediaVideoClipEntry[] {
  const entries: MediaVideoClipEntry[] = [];
  for (const track of document.timeline.tracks) {
    if (track.type !== 'visual') continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'media' || document.assets[clip.assetId]?.kind !== 'video') continue;
      entries.push({ trackId: track.id, clip, shot: mediaTimelineClipAsVideoShot(clip) });
    }
  }
  return entries;
}

/** Keep only settings that belong to a video clip; timeline/source geometry remains top-level. */
export function mediaVideoPropertiesFromShot(shot: VideoShot): MediaVideoProperties {
  return {
    treatment: shot.treatment,
    ...(shot.treatSize != null ? { treatSize: shot.treatSize } : {}),
    ...(shot.treatCrop != null ? { treatCrop: shot.treatCrop } : {}),
    ...(shot.preciseFraming ? { preciseFraming: shot.preciseFraming } : {}),
    ...(shot.filter ? { filter: shot.filter } : {}),
    ...(shot.volumeDb != null ? { volumeDb: shot.volumeDb } : {}),
    ...(shot.audioMuted ? { audioMuted: true } : {}),
    ...(shot.audioFadeInSec ? { audioFadeInSec: shot.audioFadeInSec } : {}),
    ...(shot.audioFadeOutSec ? { audioFadeOutSec: shot.audioFadeOutSec } : {}),
  };
}

/** One transactional write path for preset framing, grading, and source-audio settings on a video
 * clip outside the semantic primary lane. The same clip id keeps these settings across lane moves. */
export function applyMediaVideoSettingsPatch(
  document: EditorDocumentV2,
  input: { trackId: string; clipId: string; patch: MediaVideoSettingsPatch },
): MediaVideoEditResult {
  const track = document.timeline.tracks.find((candidate) => candidate.id === input.trackId);
  const clip = track?.clips.find((candidate): candidate is MediaTimelineClip => candidate.id === input.clipId && candidate.kind === 'media');
  if (!track) return { ok: false, error: `Track does not exist: ${input.trackId}` };
  if (!clip) return { ok: false, error: `Video media clip does not exist on track ${input.trackId}: ${input.clipId}` };
  const asset = document.assets[clip.assetId];
  if (asset?.kind !== 'video') return { ok: false, error: `Clip is not video media: ${input.clipId}` };

  let shot = mediaTimelineClipAsVideoShot(clip);
  if (input.patch.framing) shot = patchShotFraming(shot, input.patch.framing);
  if ('filter' in input.patch) {
    const { filter: _filter, ...withoutFilter } = shot;
    shot = input.patch.filter && shotFilterCss(input.patch.filter) !== 'none'
      ? { ...withoutFilter, filter: input.patch.filter }
      : withoutFilter as VideoShot;
  }
  if (input.patch.audio) shot = patchShotAudio(shot, input.patch.audio);

  const result = applyEditorCommand(document, {
    type: 'clip.patch',
    trackId: track.id,
    clipId: clip.id,
    patch: {
      mediaFraming: shot.mediaFraming ?? null,
      video: mediaVideoPropertiesFromShot(shot),
    },
  });
  if (!result.ok) {
    return { ok: false, error: result.error.message, data: { code: result.error.code, trackIds: result.error.trackIds } };
  }
  return { ok: true, document: result.document, shot };
}

/** Apply the same clip-scoped settings transaction to primary narrative clips and ordinary
 * multi-track video clips. Callers can therefore expose one Agent/UI surface without branching
 * on which visual lane currently owns a clip. No partial document escapes on failure. */
export function applyVideoClipSettingsPatches(
  document: EditorDocumentV2,
  updates: readonly VideoClipSettingsPatchUpdate[],
): VideoClipSettingsBatchResult {
  if (!updates.length) return { ok: false, error: 'At least one video clip settings patch is required.' };

  const locations = new Map(document.timeline.tracks.flatMap((track) =>
    track.clips.map((clip) => [clip.id, { trackId: track.id, clip }] as const),
  ));
  const seen = new Set<string>();
  const narrative = [] as Array<{ clipId: string; patch: MediaVideoSettingsPatch }>;
  const media = [] as Array<{ trackId: string; clipId: string; patch: MediaVideoSettingsPatch }>;

  for (const update of updates) {
    if (seen.has(update.clipId)) return { ok: false, error: `Video clip is targeted more than once: ${update.clipId}` };
    seen.add(update.clipId);
    const found = locations.get(update.clipId);
    if (!found) return { ok: false, error: `Video clip does not exist: ${update.clipId}` };
    if (found.clip.kind === 'narrative') {
      narrative.push(update);
      continue;
    }
    if (found.clip.kind !== 'media' || document.assets[found.clip.assetId]?.kind !== 'video') {
      return { ok: false, error: `Clip is not video media: ${update.clipId}` };
    }
    media.push({ trackId: found.trackId, ...update });
  }

  let next = document;
  if (narrative.length) {
    const result = patchNarrativeClips(next, narrative);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error.message,
        data: { code: result.error.code, trackIds: result.error.trackIds },
      };
    }
    next = result.document;
  }
  for (const update of media) {
    const result = applyMediaVideoSettingsPatch(next, update);
    if (!result.ok) return result;
    next = result.document;
  }
  return { ok: true, document: next };
}
