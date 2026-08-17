import { isFinitePositive } from './time';
import { isDirectorPlanV1, validateDirectorPlanV1 } from '../director-plan';
import {
  EDITOR_DOCUMENT_VERSION,
  type EditorDocumentIssue,
  type EditorDocumentV2,
  type EditorTrackRole,
  type EditorTrackType,
  type TimelineClip,
} from './types';
import { normalizeCustomVisualStyle } from '../visual-style';
import { editorTrackAcceptsClip } from './track-compatibility';

export function isEditorDocumentV2(value: unknown): value is EditorDocumentV2 {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<EditorDocumentV2>;
  if (
    document.version !== EDITOR_DOCUMENT_VERSION
    || !document.canvas || typeof document.canvas !== 'object'
    || !document.appearance || typeof document.appearance !== 'object'
    || !document.assets || typeof document.assets !== 'object' || Array.isArray(document.assets)
    || !document.timeline || !Array.isArray(document.timeline.tracks)
    || !document.semantics || typeof document.semantics !== 'object'
    || typeof document.semantics.primaryNarrativeTrackId !== 'string'
    || !document.semantics.transcripts || typeof document.semantics.transcripts !== 'object' || Array.isArray(document.semantics.transcripts)
    || !Array.isArray(document.semantics.scenes)
  ) return false;
  if (Object.values(document.assets).some((asset) => (
    !asset || typeof asset !== 'object'
    || !asset.locator || typeof asset.locator !== 'object'
    || !asset.metadata || typeof asset.metadata !== 'object'
  ))) return false;
  if (document.timeline.tracks.some((track) => (
    !track || typeof track !== 'object'
    || !Array.isArray(track.clips)
    || track.clips.some((clip) => (
      !clip || typeof clip !== 'object'
      || ('anchor' in clip && (!clip.anchor || typeof clip.anchor !== 'object'))
    ))
  ))) return false;
  if (Object.values(document.semantics.transcripts).some((segments) => !Array.isArray(segments))) return false;
  if (document.semantics.scenes.some((scene) => !scene || typeof scene !== 'object' || !Array.isArray(scene.clipIds))) return false;
  if (document.semantics.directorPlan !== undefined && !isDirectorPlanV1(document.semantics.directorPlan)) return false;
  if (document.appearance.customVisualStyle !== undefined
    && !normalizeCustomVisualStyle(document.appearance.customVisualStyle)) return false;
  return true;
}

/** Structural and referential validation. Offline assets are valid; dangling asset ids are not. */
export function validateEditorDocumentV2(document: EditorDocumentV2): EditorDocumentIssue[] {
  const issues: EditorDocumentIssue[] = [];
  const push = (severity: EditorDocumentIssue['severity'], code: string, path: string, message: string) =>
    issues.push({ severity, code, path, message });

  if (document.version !== EDITOR_DOCUMENT_VERSION) push('error', 'unsupported-version', 'version', `Expected version ${EDITOR_DOCUMENT_VERSION}.`);
  if (!isFinitePositive(document.canvas.width)) push('error', 'invalid-canvas-width', 'canvas.width', 'Canvas width must be positive.');
  if (!isFinitePositive(document.canvas.height)) push('error', 'invalid-canvas-height', 'canvas.height', 'Canvas height must be positive.');
  if (!isFinitePositive(document.canvas.fps) || document.canvas.fps > 240) push('error', 'invalid-fps', 'canvas.fps', 'FPS must be within 1..240.');

  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  const roleCounts = new Map<EditorTrackRole, number>();
  for (const [trackIndex, track] of document.timeline.tracks.entries()) {
    const trackPath = `timeline.tracks[${trackIndex}]`;
    if (trackIds.has(track.id)) push('error', 'duplicate-track-id', `${trackPath}.id`, `Duplicate track id: ${track.id}`);
    trackIds.add(track.id);
    if (track.role) roleCounts.set(track.role, (roleCounts.get(track.role) ?? 0) + 1);
    for (const [clipIndex, clip] of track.clips.entries()) {
      const clipPath = `${trackPath}.clips[${clipIndex}]`;
      if (clipIds.has(clip.id)) push('error', 'duplicate-clip-id', `${clipPath}.id`, `Duplicate clip id: ${clip.id}`);
      clipIds.add(clip.id);
      if (!editorTrackAcceptsClip(track, clip)) push('error', 'clip-track-type-mismatch', `${clipPath}.kind`, `${clip.kind} clips cannot live on a ${track.role ?? track.type} track.`);
      if (!Number.isInteger(clip.startFrame) || clip.startFrame < 0) push('error', 'invalid-clip-start', `${clipPath}.startFrame`, 'Clip start must be a non-negative integral frame.');
      if (!Number.isInteger(clip.durationFrames) || clip.durationFrames <= 0) push('error', 'invalid-clip-duration', `${clipPath}.durationFrames`, 'Clip duration must be a positive integral frame count.');
      if (clip.kind === 'caption' && clip.timingOverride && (
        !Number.isInteger(clip.timingOverride.startOffsetFrames)
        || !Number.isInteger(clip.timingOverride.endOffsetFrames)
      )) {
        push('error', 'invalid-caption-timing', `${clipPath}.timingOverride`, 'Caption timing offsets must be integral frame counts.');
      }
      if ('assetId' in clip && clip.assetId && !document.assets[clip.assetId]) push('error', 'dangling-asset', `${clipPath}.assetId`, `Missing asset: ${clip.assetId}`);
      if ((clip.kind === 'narrative' || clip.kind === 'media') && clip.sourceOutSec <= clip.sourceInSec) push('error', 'invalid-source-range', clipPath, 'Source out must be after source in.');
      if (clip.kind === 'media' || clip.kind === 'narrative') {
        const validUnit = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
        const validBox = (box: { x: number; y: number; w: number; h: number }) => (
          Number.isFinite(box.x) && Number.isFinite(box.y) && isFinitePositive(box.w) && isFinitePositive(box.h)
        );
        if (clip.box && !validBox(clip.box)) push('error', 'invalid-media-box', `${clipPath}.box`, 'Media box must be a finite canvas-relative rect with positive size.');
        if (clip.mediaFraming) {
          const framing = clip.mediaFraming;
          const t = framing.transform;
          const c = framing.crop;
          const transformValid = !!t && [t.scale, t.offsetX, t.offsetY].every(Number.isFinite) && t.scale > 0;
          const cropValid = !!c && [c.top, c.right, c.bottom, c.left].every((value) => Number.isFinite(value) && value >= 0 && value < 1)
            && c.left + c.right < 1 && c.top + c.bottom < 1;
          if (!transformValid || !cropValid || !Number.isFinite(framing.rounding) || framing.rounding < 0) {
            push('error', 'invalid-media-framing', `${clipPath}.mediaFraming`, 'Media framing needs a positive scale, finite offsets, valid 0..1 crop insets and non-negative rounding.');
          }
        }
        if (clip.kind === 'media' && clip.video) {
          const video = clip.video;
          const asset = document.assets[clip.assetId];
          const treatments = new Set(['full', 'punch-in', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'split-l', 'split-r', 'split-t', 'split-b']);
          const finiteOptional = (value: number | undefined) => value == null || Number.isFinite(value);
          const validAudio = finiteOptional(video.volumeDb)
            && (video.volumeDb == null || (video.volumeDb >= -60 && video.volumeDb <= 20))
            && finiteOptional(video.audioFadeInSec) && (video.audioFadeInSec == null || (video.audioFadeInSec >= 0 && video.audioFadeInSec <= 10))
            && finiteOptional(video.audioFadeOutSec) && (video.audioFadeOutSec == null || (video.audioFadeOutSec >= 0 && video.audioFadeOutSec <= 10));
          if (asset?.kind !== 'video' || !treatments.has(video.treatment) || !validAudio) {
            push('error', 'invalid-media-video-settings', `${clipPath}.video`, 'Video media settings require a video asset, valid framing preset, and bounded clip audio values.');
          }
        }
        if (clip.kind === 'narrative') continue;
        if (clip.anchorX != null && !validUnit(clip.anchorX)) push('error', 'invalid-media-anchor', `${clipPath}.anchorX`, 'Media anchorX must be within 0..1.');
        if (clip.anchorY != null && !validUnit(clip.anchorY)) push('error', 'invalid-media-anchor', `${clipPath}.anchorY`, 'Media anchorY must be within 0..1.');
        if (clip.opacity != null && !validUnit(clip.opacity)) push('error', 'invalid-media-opacity', `${clipPath}.opacity`, 'Media opacity must be within 0..1.');
        for (const [keyframeIndex, row] of (clip.keyframes?.box ?? []).entries()) {
          if (!Number.isInteger(row.frame) || row.frame < 0 || row.frame > clip.durationFrames || !validBox(row)) {
            push('error', 'invalid-media-keyframe', `${clipPath}.keyframes.box[${keyframeIndex}]`, 'Box keyframe must be an in-range integral clip-local frame and finite canvas-relative rect.');
          }
        }
        for (const [keyframeIndex, row] of (clip.keyframes?.opacity ?? []).entries()) {
          if (!Number.isInteger(row.frame) || row.frame < 0 || row.frame > clip.durationFrames || !validUnit(row.value)) {
            push('error', 'invalid-media-keyframe', `${clipPath}.keyframes.opacity[${keyframeIndex}]`, 'Opacity keyframe must be an in-range integral clip-local frame with value 0..1.');
          }
        }
      }
    }
  }

  for (const [role, count] of roleCounts) {
    if (count > 1 && (role === 'primaryNarrative' || role === 'managedCaptions')) {
      push('error', 'duplicate-semantic-role', 'timeline.tracks', `Only one ${role} track is allowed.`);
    }
  }

  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  if (!primary) push('error', 'missing-primary-track', 'semantics.primaryNarrativeTrackId', 'Primary narrative track does not exist.');
  else if (primary.role !== 'primaryNarrative' || primary.type !== 'visual') push('error', 'invalid-primary-track', 'semantics.primaryNarrativeTrackId', 'Primary narrative must reference a visual track with the primaryNarrative role.');
  if (document.semantics.primaryNarrativeAssetId && !document.assets[document.semantics.primaryNarrativeAssetId]) push('error', 'missing-primary-asset', 'semantics.primaryNarrativeAssetId', 'Primary narrative asset does not exist.');
  if (document.semantics.managedCaptionTrackId) {
    const captions = document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId);
    if (!captions || captions.role !== 'managedCaptions' || captions.type !== 'caption') push('error', 'invalid-caption-track', 'semantics.managedCaptionTrackId', 'Managed caption track reference is invalid.');
  }
  const captionSource = document.semantics.managedCaptionSource;
  if (captionSource?.mode === 'track' && !trackIds.has(captionSource.trackId)) {
    push('error', 'invalid-caption-source', 'semantics.managedCaptionSource.trackId', `Caption source track does not exist: ${captionSource.trackId}`);
  }
  if (captionSource?.mode === 'clip' && !clipIds.has(captionSource.clipId)) {
    push('error', 'invalid-caption-source', 'semantics.managedCaptionSource.clipId', `Caption source clip does not exist: ${captionSource.clipId}`);
  }
  for (const assetId of Object.keys(document.semantics.transcripts)) {
    if (!document.assets[assetId]) push('error', 'dangling-transcript-asset', `semantics.transcripts.${assetId}`, `Transcript references missing asset: ${assetId}`);
  }
  for (const [sceneIndex, scene] of document.semantics.scenes.entries()) {
    for (const [clipIndex, clipId] of scene.clipIds.entries()) {
      if (!clipIds.has(clipId)) {
        push('error', 'dangling-scene-clip', `semantics.scenes[${sceneIndex}].clipIds[${clipIndex}]`, `Scene references missing clip: ${clipId}`);
      }
    }
  }
  if (document.semantics.directorPlan !== undefined) {
    for (const issue of validateDirectorPlanV1(document.semantics.directorPlan)) {
      push('error', `director-plan-${issue.code}`, `semantics.directorPlan${issue.path ? `.${issue.path}` : ''}`, issue.message);
    }
  }

  // Anchor validation needs the complete clip-id set so forward references are legal.
  for (const [trackIndex, track] of document.timeline.tracks.entries()) {
    for (const [clipIndex, clip] of track.clips.entries()) {
      if (!('anchor' in clip)) continue;
      const path = `timeline.tracks[${trackIndex}].clips[${clipIndex}].anchor`;
      if (clip.anchor.type === 'clip' && !clipIds.has(clip.anchor.clipId)) push('error', 'dangling-clip-anchor', path, `Anchor references missing clip: ${clip.anchor.clipId}`);
      if (clip.anchor.type === 'word' && !document.assets[clip.anchor.assetId]) push('error', 'dangling-word-anchor', path, `Word anchor references missing asset: ${clip.anchor.assetId}`);
    }
  }
  return issues;
}

export function editorTimelineTotalFrames(document: EditorDocumentV2): number {
  let end = 0;
  for (const track of document.timeline.tracks) {
    // Visibility/enabled flags affect rendering, not document geometry: a hidden/disabled clip
    // still occupies its timeline range and revealing it must not resize the project duration.
    for (const clip of track.clips) end = Math.max(end, clip.startFrame + clip.durationFrames);
  }
  return end;
}
