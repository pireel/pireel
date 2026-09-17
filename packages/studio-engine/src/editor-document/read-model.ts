import type {
  EditorDocumentV2,
  EditorMediaAsset,
  EditorTrack,
  NarrativeTimelineClip,
} from './types';
import { secondsToTimelineFrames } from './time';
import { primaryNarrativeTrack } from './create';

/**
 * First stack order at or above `preferred` (never below 1) with no graphic or caption clip in
 * the [startFrame, startFrame + durationFrames) window. Lanes are layers, not categories; the
 * caller places or mints the lane at the returned order, so the lane it addresses is the one
 * this computed.
 */
export function freeOverlayStackOrder(document: EditorDocumentV2, startFrame: number, durationFrames: number, preferred = 2): number {
  const end = startFrame + Math.max(1, durationFrames);
  const occupied = new Set<number>();
  for (const track of document.timeline.tracks) {
    const order = Math.max(1, track.stackOrder);
    if (occupied.has(order)) continue;
    const clash = track.clips.some((clip) => (
      (clip.kind === 'graphic' || clip.kind === 'caption')
      && clip.startFrame < end
      && clip.startFrame + clip.durationFrames > startFrame
    ));
    if (clash) occupied.add(order);
  }
  for (let order = Math.max(1, preferred); ; order += 1) if (!occupied.has(order)) return order;
}

/** `freeOverlayStackOrder` for callers that still hold seconds. */
export function freeOverlayTrackIndex(document: EditorDocumentV2, startSec: number, durationSec: number, preferred = 2): number {
  const fps = document.canvas.fps;
  return freeOverlayStackOrder(document, secondsToTimelineFrames(startSec, fps), Math.max(1, secondsToTimelineFrames(durationSec, fps)), preferred);
}

export interface NarrativeTimelineHit {
  track: EditorTrack;
  clip: NarrativeTimelineClip;
  atFrame: number;
  timelineSec: number;
  sourceSec: number;
}

export interface NarrativeTimelineRange {
  clipId: string;
  assetId: string;
  fromSec: number;
  toSec: number;
  sourceFromSec: number;
  sourceToSec: number;
}

export interface NarrativeSourceRangeOptions {
  /**
   * Snap a mapped semantic passage to a nearby native clip edge. This absorbs the short speech
   * guard left by an earlier dead-air cut instead of turning it into a standalone flash shot.
   * Exact word and raw timeline edits should leave this unset.
  */
  clipEdgeSnapSec?: number;
  /** Source-clock speech that must not be swallowed while snapping an adjacent semantic cut. */
  protectedSourceRanges?: readonly { fromSec: number; toSec: number }[];
}

export function primaryNarrativeClips(document: EditorDocumentV2): NarrativeTimelineClip[] {
  return (primaryNarrativeTrack(document)?.clips ?? [])
    .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
}

export function hasPrimaryNarrativeClips(document: EditorDocumentV2): boolean {
  return primaryNarrativeClips(document).length > 0;
}

/** First source by narrative-lane order. This is an ordering convenience, never a privileged asset. */
export function firstNarrativeAsset(document: EditorDocumentV2): EditorMediaAsset | undefined {
  const assetId = primaryNarrativeClips(document)[0]?.assetId;
  return assetId ? document.assets[assetId] : undefined;
}

/** First source id by narrative-lane order. Prefer an explicit clip/asset selection for edits. */
export function firstNarrativeAssetId(document: EditorDocumentV2): string | undefined {
  return primaryNarrativeClips(document)[0]?.assetId;
}

/** Resolve a real timeline second against native clip placement, preserving leading/middle gaps. */
export function narrativeAtTimelineSecond(
  document: EditorDocumentV2,
  timelineSec: number,
  edgeEpsilonFrames = 1,
): NarrativeTimelineHit | null {
  if (!Number.isFinite(timelineSec)) return null;
  const atFrame = secondsToTimelineFrames(timelineSec, document.canvas.fps);
  const track = primaryNarrativeTrack(document);
  if (!track) return null;
  const clip = primaryNarrativeClips(document).find((candidate) => (
    atFrame >= candidate.startFrame + edgeEpsilonFrames
    && atFrame <= candidate.startFrame + candidate.durationFrames - edgeEpsilonFrames
  ));
  if (!clip) return null;
  const ratio = (atFrame - clip.startFrame) / clip.durationFrames;
  return {
    track,
    clip,
    atFrame,
    timelineSec: atFrame / document.canvas.fps,
    sourceSec: clip.sourceInSec + ratio * (clip.sourceOutSec - clip.sourceInSec),
  };
}

export function narrativeClipTimelineRange(
  document: EditorDocumentV2,
  clipId: string,
): { fromSec: number; toSec: number } | null {
  const clip = primaryNarrativeClips(document).find((candidate) => candidate.id === clipId);
  if (!clip) return null;
  return {
    fromSec: clip.startFrame / document.canvas.fps,
    toSec: (clip.startFrame + clip.durationFrames) / document.canvas.fps,
  };
}

/** The portion of the clip on one side of a real native-timeline playhead. */
export function narrativeTrimRangeAtTimelineSecond(
  document: EditorDocumentV2,
  timelineSec: number,
  side: 'left' | 'right',
): { fromSec: number; toSec: number } | null {
  const hit = narrativeAtTimelineSecond(document, timelineSec);
  if (!hit) return null;
  const clipStartSec = hit.clip.startFrame / document.canvas.fps;
  const clipEndSec = (hit.clip.startFrame + hit.clip.durationFrames) / document.canvas.fps;
  return side === 'left'
    ? { fromSec: clipStartSec, toSec: hit.timelineSec }
    : { fromSec: hit.timelineSec, toSec: clipEndSec };
}

/** Map one asset's source-clock range onto every surviving occurrence on the native timeline. */
export function narrativeTimelineRangesForAssetSourceRange(
  document: EditorDocumentV2,
  assetId: string,
  sourceFromSec: number,
  sourceToSec: number,
  options: NarrativeSourceRangeOptions = {},
): NarrativeTimelineRange[] {
  if (!assetId || !Number.isFinite(sourceFromSec) || !Number.isFinite(sourceToSec) || sourceToSec <= sourceFromSec) return [];
  const clipEdgeSnapSec = Number.isFinite(options.clipEdgeSnapSec)
    ? Math.max(0, options.clipEdgeSnapSec ?? 0)
    : 0;
  const overlapsProtectedSpeech = (fromSec: number, toSec: number): boolean => (
    toSec - fromSec > 0.001
    && (options.protectedSourceRanges ?? []).some((range) => (
      range.fromSec < toSec - 0.001 && range.toSec > fromSec + 0.001
    ))
  );
  return primaryNarrativeClips(document).flatMap((clip) => {
    if (clip.assetId !== assetId) return [];
    const sourceFrom = Math.max(sourceFromSec, clip.sourceInSec);
    const sourceTo = Math.min(sourceToSec, clip.sourceOutSec);
    if (sourceTo - sourceFrom <= 0.001) return [];
    const sourceDuration = clip.sourceOutSec - clip.sourceInSec;
    if (sourceDuration <= 0) return [];
    const timelineStart = clip.startFrame / document.canvas.fps;
    const timelineDuration = clip.durationFrames / document.canvas.fps;
    const timelineEnd = timelineStart + timelineDuration;
    const mappedFrom = timelineStart + ((sourceFrom - clip.sourceInSec) / sourceDuration) * timelineDuration;
    const mappedTo = timelineStart + ((sourceTo - clip.sourceInSec) / sourceDuration) * timelineDuration;
    const snapFrom = mappedFrom - timelineStart <= clipEdgeSnapSec + 1e-6
      && !overlapsProtectedSpeech(clip.sourceInSec, sourceFrom);
    const snapTo = timelineEnd - mappedTo <= clipEdgeSnapSec + 1e-6
      && !overlapsProtectedSpeech(sourceTo, clip.sourceOutSec);
    return [{
      clipId: clip.id,
      assetId,
      fromSec: snapFrom ? timelineStart : mappedFrom,
      toSec: snapTo ? timelineEnd : mappedTo,
      sourceFromSec: sourceFrom,
      sourceToSec: sourceTo,
    }];
  }).sort((left, right) => right.fromSec - left.fromSec);
}

export function primaryNarrativeTimelineEndSec(document: EditorDocumentV2): number {
  return primaryNarrativeClips(document).reduce(
    (end, clip) => Math.max(end, (clip.startFrame + clip.durationFrames) / document.canvas.fps),
    0,
  );
}
