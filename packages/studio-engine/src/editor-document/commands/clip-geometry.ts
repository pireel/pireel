import type {
  AudioTimelineClip,
  MediaTimelineClip,
  NarrativeTimelineClip,
  TimelineClip,
} from '../types';

export interface ClipRangeEdit {
  clips: TimelineClip[];
  removedClipIds: string[];
  createdClipIds: string[];
  splitPairs: [originalId: string, rightId: string][];
}

export function clipEndFrame(clip: TimelineClip): number {
  return clip.startFrame + clip.durationFrames;
}

export function clipOverlapsRange(clip: TimelineClip, startFrame: number, endFrame: number): boolean {
  return clip.startFrame < endFrame && clipEndFrame(clip) > startFrame;
}

export function derivedSplitId(baseId: string, splitFrame: number, usedIds: Set<string>): string {
  const stem = `${baseId}~split-${splitFrame}`;
  let candidate = stem;
  let suffix = 2;
  while (usedIds.has(candidate)) candidate = `${stem}-${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

function sourceAtFrame(
  clip: NarrativeTimelineClip | MediaTimelineClip | AudioTimelineClip,
  offsetFrames: number,
  fps: number,
): number {
  if (clip.kind === 'audio') {
    if (clip.sourceOutSec == null) {
      return clip.sourceInSec + offsetFrames / fps * (clip.properties.speed ?? 1);
    }
    return clip.sourceInSec + (clip.sourceOutSec - clip.sourceInSec) * (offsetFrames / clip.durationFrames);
  }
  const sourceSpan = clip.sourceOutSec - clip.sourceInSec;
  return clip.sourceInSec + sourceSpan * (offsetFrames / clip.durationFrames);
}

function withoutIncomingTransition(clip: NarrativeTimelineClip): NarrativeTimelineClip {
  const { transIn: _removed, ...properties } = clip.properties;
  return { ...clip, properties };
}

function withTrimmedTail(clip: TimelineClip, durationFrames: number, fps: number): TimelineClip {
  if (clip.kind === 'narrative' || clip.kind === 'media') {
    return { ...clip, durationFrames, sourceOutSec: sourceAtFrame(clip, durationFrames, fps) };
  }
  if (clip.kind === 'audio') {
    return { ...clip, durationFrames, sourceOutSec: sourceAtFrame(clip, durationFrames, fps) };
  }
  return { ...clip, durationFrames };
}

function withTrimmedHead(
  clip: TimelineClip,
  id: string,
  startFrame: number,
  durationFrames: number,
  removedHeadFrames: number,
  fps: number,
  rightLinkGroupId?: string,
): TimelineClip {
  const placement = {
    id,
    startFrame,
    durationFrames,
    ...(rightLinkGroupId ? { linkGroupId: rightLinkGroupId } : {}),
  };
  if (clip.kind === 'narrative') {
    return withoutIncomingTransition({
      ...clip,
      ...placement,
      sourceInSec: sourceAtFrame(clip, removedHeadFrames, fps),
    });
  }
  if (clip.kind === 'media') {
    return { ...clip, ...placement, sourceInSec: sourceAtFrame(clip, removedHeadFrames, fps) };
  }
  if (clip.kind === 'audio') {
    return { ...clip, ...placement, sourceInSec: sourceAtFrame(clip, removedHeadFrames, fps) };
  }
  return { ...clip, ...placement };
}

/**
 * Clears [startFrame, endFrame) from one clip without moving the surviving pieces.
 * Source-backed clips retain exact source coordinates; a clip spanning both boundaries
 * becomes two clips with deterministic ids.
 */
export function clearRangeFromClip(
  clip: TimelineClip,
  startFrame: number,
  endFrame: number,
  fps: number,
  usedIds: Set<string>,
): ClipRangeEdit {
  if (!clipOverlapsRange(clip, startFrame, endFrame)) {
    return { clips: [clip], removedClipIds: [], createdClipIds: [], splitPairs: [] };
  }

  const clipEnd = clipEndFrame(clip);
  const keepLeftFrames = Math.max(0, startFrame - clip.startFrame);
  const keepRightFrames = Math.max(0, clipEnd - endFrame);
  if (keepLeftFrames === 0 && keepRightFrames === 0) {
    return { clips: [], removedClipIds: [clip.id], createdClipIds: [], splitPairs: [] };
  }
  if (keepRightFrames === 0) {
    return {
      clips: [withTrimmedTail(clip, keepLeftFrames, fps)],
      removedClipIds: [],
      createdClipIds: [],
      splitPairs: [],
    };
  }
  if (keepLeftFrames === 0) {
    return {
      clips: [withTrimmedHead(
        clip,
        clip.id,
        endFrame,
        keepRightFrames,
        endFrame - clip.startFrame,
        fps,
      )],
      removedClipIds: [],
      createdClipIds: [],
      splitPairs: [],
    };
  }

  const rightId = derivedSplitId(clip.id, endFrame, usedIds);
  const rightLinkGroupId = clip.linkGroupId ? `${clip.linkGroupId}~split-${endFrame}` : undefined;
  return {
    clips: [
      withTrimmedTail(clip, keepLeftFrames, fps),
      withTrimmedHead(
        clip,
        rightId,
        endFrame,
        keepRightFrames,
        endFrame - clip.startFrame,
        fps,
        rightLinkGroupId,
      ),
    ],
    removedClipIds: [],
    createdClipIds: [rightId],
    splitPairs: [[clip.id, rightId]],
  };
}

/** Splits a straddling clip at an insertion point; clips wholly on either side are returned unchanged. */
export function splitClipAtFrame(
  clip: TimelineClip,
  atFrame: number,
  fps: number,
  usedIds: Set<string>,
): ClipRangeEdit {
  const endFrame = clipEndFrame(clip);
  if (atFrame <= clip.startFrame || atFrame >= endFrame) {
    return { clips: [clip], removedClipIds: [], createdClipIds: [], splitPairs: [] };
  }
  const leftFrames = atFrame - clip.startFrame;
  const rightFrames = endFrame - atFrame;
  const rightId = derivedSplitId(clip.id, atFrame, usedIds);
  const rightLinkGroupId = clip.linkGroupId ? `${clip.linkGroupId}~split-${atFrame}` : undefined;
  return {
    clips: [
      withTrimmedTail(clip, leftFrames, fps),
      withTrimmedHead(clip, rightId, atFrame, rightFrames, leftFrames, fps, rightLinkGroupId),
    ],
    removedClipIds: [],
    createdClipIds: [rightId],
    splitPairs: [[clip.id, rightId]],
  };
}
