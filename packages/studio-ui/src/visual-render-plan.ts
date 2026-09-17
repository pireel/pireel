import { type MaskedAudioRange, maskedAudioAt } from '@pireel/studio-engine/word-masks';
import type {
  EditorRenderPlan,
  MediaTimelineClip,
  SupplementalVisualMediaClip,
} from '@pireel/studio-engine/composition';
import { mediaTimelineClipAsVideoShot, segmentFadeFn, shotGain } from '@pireel/studio-engine/composition';
import type { EngineAudioClip, EngineLayer } from './video-track-engine';

export interface SupplementalVisualAudioMixSegment {
  clipId: string;
  sourceInSec: number;
  sourceOutSec: number;
  timelineStart: number;
  timelineEnd: number;
  gain: number;
  fadeAt?: (tLocal: number) => number;
}

/** Renderable non-primary visual media. Missing/offline assets remain in the document, not the runtime list. */
export function supplementalVisualMedia(plan: EditorRenderPlan): SupplementalVisualMediaClip[] {
  const result: SupplementalVisualMediaClip[] = [];
  for (const track of plan.tracks) {
    if (track.type === 'audio' || track.id === plan.primaryNarrativeTrackId || track.hidden) continue;
    for (const entry of track.clips) {
      if (entry.clip.kind !== 'media' || !entry.clip.enabled || !entry.asset || !entry.resolvedSource) continue;
      if (entry.asset.kind !== 'image' && entry.asset.kind !== 'video') continue;
      const clip = entry.clip as MediaTimelineClip;
      const video = entry.asset.kind === 'video' ? mediaTimelineClipAsVideoShot(clip) : null;
      result.push({
        clipId: entry.clipId,
        trackId: track.id,
        stackOrder: track.stackOrder,
        kind: entry.asset.kind,
        source: entry.resolvedSource,
        ...(entry.asset.metadata.width && entry.asset.metadata.height
          ? { sourceWidth: entry.asset.metadata.width, sourceHeight: entry.asset.metadata.height }
          : {}),
        startSec: entry.startSec,
        endSec: entry.endSec,
        sourceInSec: clip.sourceInSec,
        sourceOutSec: clip.sourceOutSec,
        fit: clip.fit ?? 'contain',
        muted: track.muted,
        ...(video?.volumeDb != null ? { volumeDb: video.volumeDb } : {}),
        ...(video?.audioMuted ? { audioMuted: true } : {}),
        ...(video?.audioFadeInSec ? { audioFadeInSec: video.audioFadeInSec } : {}),
        ...(video?.audioFadeOutSec ? { audioFadeOutSec: video.audioFadeOutSec } : {}),
        ...(video?.filter ? { filter: video.filter } : {}),
        ...(video?.zoom ? { zoom: video.zoom } : {}),
        ...(clip.box ? { box: clip.box } : {}),
        ...(clip.mediaFraming ? { mediaFraming: clip.mediaFraming } : {}),
        ...(clip.anchorX != null ? { anchorX: clip.anchorX } : {}),
        ...(clip.anchorY != null ? { anchorY: clip.anchorY } : {}),
        ...(clip.opacity != null ? { opacity: clip.opacity } : {}),
        ...(clip.keyframes ? { keyframes: {
          ...(clip.keyframes.box?.length ? { box: clip.keyframes.box.map((row) => ({ ...row, atSec: row.frame / plan.fps })) } : {}),
          ...(clip.keyframes.opacity?.length ? { opacity: clip.keyframes.opacity.map((row) => ({ ...row, atSec: row.frame / plan.fps })) } : {}),
        } } : {}),
      });
    }
  }
  return result.sort((left, right) => (
    left.stackOrder - right.stackOrder || left.startSec - right.startSec || left.clipId.localeCompare(right.clipId)
  ));
}

/** Source-audio segments for non-primary video lanes. Preview and export both consume this exact
 * clip envelope so moving a clip off the primary lane cannot change its audible settings. */
export function supplementalVisualAudioMixSegments(
  visuals: readonly SupplementalVisualMediaClip[],
): SupplementalVisualAudioMixSegment[] {
  return visuals.filter((visual) => visual.kind === 'video').map((visual) => {
    const duration = Math.max(1e-9, visual.endSec - visual.startSec);
    const fadeAt = segmentFadeFn(visual, duration, false, false);
    return {
      clipId: visual.clipId,
      sourceInSec: visual.sourceInSec,
      sourceOutSec: visual.sourceOutSec,
      timelineStart: visual.startSec,
      timelineEnd: visual.endSec,
      gain: visual.muted ? 0 : shotGain(visual),
      ...(fadeAt ? { fadeAt } : {}),
    };
  });
}

/**
 * Parent-side preview audio for ordinary video lanes. Browsers may reject audible play() inside the
 * sandboxed preview iframe even when its frames keep advancing, so the iframe is picture-only and
 * these specs feed the same resident audio engine used by music/narration.
 */
export function supplementalVisualAudioSpecs(
  visuals: readonly SupplementalVisualMediaClip[],
  clipMasks?: ReadonlyMap<string, readonly MaskedAudioRange[]>,
): EngineAudioClip[] {
  const segments = new Map(supplementalVisualAudioMixSegments(visuals).map((segment) => [segment.clipId, segment]));
  return visuals.filter((visual) => visual.kind === 'video').map((visual) => {
    const segment = segments.get(visual.clipId)!;
    const masks = clipMasks?.get(visual.clipId);
    const timelineDuration = Math.max(1e-9, visual.endSec - visual.startSec);
    const sourceDuration = Math.max(0, visual.sourceOutSec - visual.sourceInSec);
    const rate = sourceDuration / timelineDuration;
    const activeAt = (time: number) => time >= visual.startSec && time < visual.endSec;
    return {
      id: `visual-audio:${visual.clipId}`,
      url: visual.source,
      speed: Math.min(16, Math.max(0.0625, rate || 1)),
      gainAt: (time) => (!activeAt(time)
        ? 0
        : segment.gain * (segment.fadeAt ? segment.fadeAt(time - visual.startSec) : 1)),
      srcTimeAt: (time) => {
        if (!activeAt(time)) return null;
        return Math.min(visual.sourceOutSec, Math.max(visual.sourceInSec, visual.sourceInSec + (time - visual.startSec) * rate));
      },
      ...(masks?.length ? { maskAt: (srcT: number) => maskedAudioAt(masks, srcT) } : {}),
    };
  });
}

/** Overlay video layers for the preview engine: one picture-only read position per visible video clip. */
export function supplementalVisualLayers(visuals: readonly SupplementalVisualMediaClip[]): EngineLayer[] {
  return visuals.filter((visual) => visual.kind === 'video').map((visual) => ({
    id: visual.clipId,
    elKey: `hf-visual-${visual.clipId}`,
    key: visual.source,
    srcStart: visual.sourceInSec,
    srcEnd: visual.sourceOutSec,
    timelineStart: visual.startSec,
    timelineEnd: visual.endSec,
  }));
}
