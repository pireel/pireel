import type { AudioClip } from '../audio-tracks';
import type { Block, Composition, StudioVideo, VideoShot } from '../composition-core';
import { isFinitePositive, timelineFramesToSeconds } from './time';
import type {
  EditorDocumentV2,
  EditorMediaAsset,
  LegacyProjectionOptions,
  NarrativeTimelineClip,
} from './types';

function projectedAssetUrl(asset: EditorMediaAsset, options?: LegacyProjectionOptions, offlineFallback = true): string | undefined {
  return options?.resolveAssetUrl?.(asset)
    ?? asset.locator.remoteUrl
    // Preserve source identity in the V1 compatibility view while bytes are offline. Existing
    // recovery code treats blob URLs as unavailable and replaces them from localSig/cloudKey.
    ?? (offlineFallback && (asset.locator.localSig || asset.locator.cloudKey) ? `blob:pireel-offline/${asset.id}` : undefined);
}

/** Temporary V2 -> V1 read adapter. It intentionally cannot represent visual gaps or overlapping narrative clips. */
export function projectV2ToLegacyComposition(document: EditorDocumentV2, options?: LegacyProjectionOptions): Composition {
  const fps = document.canvas.fps;
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const mainAssetId = document.semantics.primaryNarrativeAssetId;
  const mainAsset = mainAssetId ? document.assets[mainAssetId] : undefined;
  const mainUrl = mainAsset ? projectedAssetUrl(mainAsset, options, false) : undefined;
  const mainDuration = mainAsset?.metadata.durationSec;
  const video: StudioVideo | null = mainAsset && mainUrl && isFinitePositive(mainDuration)
    ? {
        url: mainUrl,
        durationSec: mainDuration,
        ...(mainAsset.metadata.width ? { sourceWidth: mainAsset.metadata.width } : {}),
        ...(mainAsset.metadata.height ? { sourceHeight: mainAsset.metadata.height } : {}),
      }
    : null;

  const shots: VideoShot[] = (primary?.clips ?? [])
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
        ...(clip.assetId !== mainAssetId && src ? { src } : {}),
        ...(clip.assetId !== mainAssetId && asset.locator.localSig ? { srcSig: asset.locator.localSig } : {}),
      };
    });

  const blocks: Block[] = [];
  const audioTracks: AudioClip[] = [];
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'graphic' || clip.kind === 'caption') {
        let block = clip.block;
        if (clip.kind === 'graphic' && clip.assetId) {
          const asset = document.assets[clip.assetId];
          const url = asset && projectedAssetUrl(asset, options);
          if (asset && url) block = { ...block, slots: { ...block.slots, media: { type: asset.kind, url } } };
        }
        blocks.push({
          id: clip.id,
          startSec: timelineFramesToSeconds(clip.startFrame, fps),
          durationSec: timelineFramesToSeconds(clip.durationFrames, fps),
          trackIndex: Math.max(1, track.stackOrder),
          ...block,
        });
      } else if (clip.kind === 'audio') {
        const asset = document.assets[clip.assetId];
        const src = asset && projectedAssetUrl(asset, options);
        if (!asset || !src) continue;
        audioTracks.push({
          id: clip.id,
          src,
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
    video,
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
