import type { AudioClip } from '../audio-tracks';
import type { Block, Composition, VideoShot } from '../composition-core';
import { timelineFramesToSeconds } from './time';
import type {
  CaptionTimelineClip,
  EditorDocumentV2,
  EditorMediaAsset,
  EditorTrack,
  GraphicTimelineClip,
  LegacyProjectionOptions,
  NarrativeTimelineClip,
} from './types';
import { normalizePeerNarrativeSources } from './source-peer-normalization';

function projectedAssetUrl(asset: EditorMediaAsset, options?: LegacyProjectionOptions, offlineFallback = true): string | undefined {
  return options?.resolveAssetUrl?.(asset)
    ?? asset.locator.remoteUrl
    // Preserve source identity in the V1 compatibility view while bytes are offline. Existing
    // recovery code treats blob URLs as unavailable and replaces them from localSig/cloudKey.
    ?? (offlineFallback ? `blob:pireel-offline/${asset.id}` : undefined);
}

function narrativeShotsOf(document: EditorDocumentV2, options?: LegacyProjectionOptions): VideoShot[] {
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  return (primary?.clips ?? [])
    .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
    .sort((left, right) => left.startFrame - right.startFrame)
    .map((clip) => {
      const asset = document.assets[clip.assetId]!;
      const src = projectedAssetUrl(asset, options);
      return {
        id: clip.id,
        srcStart: clip.sourceInSec,
        srcEnd: clip.sourceOutSec,
        ...clip.properties,
        ...(clip.mediaFraming ? { mediaFraming: clip.mediaFraming } : {}),
        ...(src ? { src } : {}),
        ...(asset.locator.localSig ? { srcSig: asset.locator.localSig } : {}),
      };
    });
}

/** The primary narrative lane in shot vocabulary (source in/out, treatment, transitions), for the
 * editing primitives that still speak shots. Shot ids are the clip ids. */
export function projectNarrativeShots(document: EditorDocumentV2, options?: LegacyProjectionOptions): VideoShot[] {
  return narrativeShotsOf(normalizePeerNarrativeSources(document), options);
}

export type OverlayTimelineClip = GraphicTimelineClip | CaptionTimelineClip;

/** One graphic or caption clip in block vocabulary: timing in seconds, the track's stack order as
 * trackIndex, a media template's URL resolved from the manifest. */
export function projectOverlayBlock(
  document: EditorDocumentV2,
  track: Pick<EditorTrack, 'stackOrder'>,
  clip: OverlayTimelineClip,
  options?: LegacyProjectionOptions,
): Block {
  const fps = document.canvas.fps;
  let block = clip.block;
  if (clip.kind === 'graphic' && clip.assetId) {
    const asset = document.assets[clip.assetId];
    const url = asset && projectedAssetUrl(asset, options);
    if (asset && url) block = { ...block, slots: { ...block.slots, media: { type: asset.kind, url } } };
  }
  return {
    id: clip.id,
    startSec: timelineFramesToSeconds(clip.startFrame, fps),
    durationSec: timelineFramesToSeconds(clip.durationFrames, fps),
    trackIndex: Math.max(1, track.stackOrder),
    ...block,
  };
}

/** The graphic or caption clip with this id, projected as a block; undefined for any other id. */
export function projectOverlayBlockById(document: EditorDocumentV2, clipId: string, options?: LegacyProjectionOptions): Block | undefined {
  for (const track of document.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (!clip) continue;
    return clip.kind === 'graphic' || clip.kind === 'caption' ? projectOverlayBlock(document, track, clip, options) : undefined;
  }
  return undefined;
}

/** Every graphic and caption clip as blocks, in track order. */
export function overlayBlocks(document: EditorDocumentV2, options?: LegacyProjectionOptions): Block[] {
  return document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => (
    clip.kind === 'graphic' || clip.kind === 'caption' ? [projectOverlayBlock(document, track, clip, options)] : []
  )));
}

/** Temporary V2 -> V1 read adapter. It intentionally cannot represent visual gaps or overlapping narrative clips. */
export function projectV2ToLegacyComposition(document: EditorDocumentV2, options?: LegacyProjectionOptions): Composition {
  document = normalizePeerNarrativeSources(document);
  const fps = document.canvas.fps;
  const shots = narrativeShotsOf(document, options);
  const blocks: Block[] = [];
  const audioTracks: AudioClip[] = [];
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'graphic' || clip.kind === 'caption') {
        blocks.push(projectOverlayBlock(document, track, clip, options));
      } else if (clip.kind === 'audio') {
        const asset = document.assets[clip.assetId];
        const src = asset && projectedAssetUrl(asset, options);
        if (!asset || !src) continue;
        audioTracks.push({
          id: clip.id,
          src,
          // Legacy AudioClip absence already means music; only project roles whose defaults differ.
          ...(track.role === 'narration' || track.role === 'sfx'
            ? { role: track.role }
            : track.role === 'music'
              ? {}
              : { role: 'audio' as const }),
          ...(asset.locator.localSig ? { sig: asset.locator.localSig } : {}),
          ...(asset.label ? { label: asset.label } : {}),
          ...(asset.metadata.durationSec ? { durationSec: asset.metadata.durationSec } : {}),
          startSec: timelineFramesToSeconds(clip.startFrame, fps),
          inSec: clip.sourceInSec,
          ...(clip.sourceOutSec != null ? { outSec: clip.sourceOutSec } : {}),
          ...clip.properties,
        });
      }
    }
  }

  return {
    width: document.canvas.width,
    height: document.canvas.height,
    theme: document.appearance.theme,
    // V1 compatibility keeps the property shape, but V2 has no privileged video source. Every
    // narrative shot resolves its own source above.
    video: null,
    blocks,
    shots,
    ...(document.appearance.palette ? { palette: document.appearance.palette } : {}),
    ...(document.appearance.captionStyle ? { captionStyle: document.appearance.captionStyle } : {}),
    ...(document.appearance.frameId ? { frameId: document.appearance.frameId } : {}),
    ...(document.appearance.customVisualStyle ? { customVisualStyle: document.appearance.customVisualStyle } : {}),
    ...(document.appearance.personFx ? { personFx: document.appearance.personFx } : {}),
    ...(audioTracks.length ? { audioTracks } : {}),
    ...(document.processing?.audioDenoise ? { audioDenoise: document.processing.audioDenoise } : {}),
  };
}
