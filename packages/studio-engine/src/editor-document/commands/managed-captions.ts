import { captionBlocksFromAsr, type AsrSegment, type CueRef } from '../../build-blocks';
import { displayCuesFromMappedSegs, mapTranscriptSegsToEdited } from '../../captions-relay';
import { positiveDurationFrames, secondsToTimelineFrames, timelineFramesToSeconds } from '../time';
import type {
  CaptionSourceRef,
  CaptionTimelineClip,
  EditorDocumentV2,
  GraphicBlockPayload,
  NarrativeTimelineClip,
  TimelineClip,
} from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

function stripBlockPlacement(block: ReturnType<typeof captionBlocksFromAsr>[number]): GraphicBlockPayload {
  const { id: _id, startSec: _startSec, durationSec: _durationSec, trackIndex: _trackIndex, ...payload } = block;
  return payload;
}

function primaryNarrativeClips(document: EditorDocumentV2): NarrativeTimelineClip[] {
  const track = document.timeline.tracks.find((candidate) => candidate.id === document.semantics.primaryNarrativeTrackId);
  return (track?.clips ?? [])
    .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative' && clip.enabled)
    .sort((left, right) => left.startFrame - right.startFrame);
}

/** Source seconds mapped through native clip placement, including explicit gaps and retiming. */
function sourceSecToTimelineSec(
  clips: readonly NarrativeTimelineClip[],
  assetId: string,
  sourceSec: number,
  fps: number,
): number {
  let lastEndSec = 0;
  for (const clip of clips) {
    if (clip.assetId !== assetId) continue;
    const startSec = timelineFramesToSeconds(clip.startFrame, fps);
    const endSec = timelineFramesToSeconds(clip.startFrame + clip.durationFrames, fps);
    if (sourceSec < clip.sourceInSec) return startSec;
    if (sourceSec < clip.sourceOutSec) {
      const ratio = (sourceSec - clip.sourceInSec) / (clip.sourceOutSec - clip.sourceInSec);
      return startSec + ratio * (endSec - startSec);
    }
    lastEndSec = endSec;
  }
  return lastEndSec;
}

function priorSourceKeys(document: EditorDocumentV2, clips: readonly TimelineClip[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const clip of clips) {
    if (clip.kind !== 'caption' || !clip.sourceRef || clip.sourceRef.assetId === document.semantics.primaryNarrativeAssetId) continue;
    const ref = clip.block.slots.ref as { src?: unknown } | undefined;
    if (typeof ref?.src === 'string' && ref.src && !keys.has(clip.sourceRef.assetId)) keys.set(clip.sourceRef.assetId, ref.src);
  }
  return keys;
}

function uniqueClipId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let suffix = 2;
  while (used.has(`${preferred}_${suffix}`)) suffix += 1;
  const id = `${preferred}_${suffix}`;
  used.add(id);
  return id;
}

/** Rebuild the semantic managed-caption lane directly from V2 transcript and narrative truth. */
export function relayManagedCaptionTrack(document: EditorDocumentV2): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const trackId = document.semantics.managedCaptionTrackId;
  if (!trackId) return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  const trackIndex = document.timeline.tracks.findIndex((candidate) => candidate.id === trackId);
  if (trackIndex < 0) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  const track = document.timeline.tracks[trackIndex]!;
  if (track.locked) return commandFailure(document, 'track-locked', `Track is locked: ${trackId}`, { trackIds: [trackId] });

  const narrative = primaryNarrativeClips(document);
  const narrativeAssetIds = new Set(narrative.map((clip) => clip.assetId));
  const transcriptEntries = Object.entries(document.semantics.transcripts)
    .filter(([assetId, segments]) => narrativeAssetIds.has(assetId) && segments.length > 0);
  const captionTruthKnown = Object.values(document.semantics.transcripts).some((segments) => segments.length > 0);
  if (!transcriptEntries.length && !(narrative.length === 0 && captionTruthKnown)) {
    return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  }

  const primaryAssetId = document.semantics.primaryNarrativeAssetId;
  const sourceKeys = priorSourceKeys(document, track.clips);
  const assetBySourceKey = new Map<string, string>();
  const mapped = transcriptEntries.flatMap(([assetId, segments]) => {
    const sourceKey = assetId === primaryAssetId
      ? null
      : sourceKeys.get(assetId) ?? document.assets[assetId]?.locator.remoteUrl ?? `blob:pireel-offline/${assetId}`;
    if (sourceKey) assetBySourceKey.set(sourceKey, assetId);
    return mapTranscriptSegsToEdited(
      segments as AsrSegment[],
      (sourceSec) => sourceSecToTimelineSec(narrative, assetId, sourceSec, document.canvas.fps),
      sourceKey,
    );
  }).sort((left, right) => left.start - right.start);
  const sourceSegment = (ref: CueRef): AsrSegment | undefined => {
    const assetId = ref.src ? assetBySourceKey.get(ref.src) : primaryAssetId;
    return assetId ? document.semantics.transcripts[assetId]?.[ref.seg] as AsrSegment | undefined : undefined;
  };
  const cues = displayCuesFromMappedSegs(mapped, sourceSegment, { canvasW: document.canvas.width });
  const blocks = captionBlocksFromAsr(cues);
  const existingById = new Map(track.clips.map((clip) => [clip.id, clip] as const));
  const usedIds = new Set(document.timeline.tracks
    .filter((candidate) => candidate.id !== trackId)
    .flatMap((candidate) => candidate.clips.map((clip) => clip.id)));
  const clips: CaptionTimelineClip[] = blocks.map((block, index) => {
    const ref = block.slots.ref as CueRef | undefined;
    const assetId = ref?.src ? assetBySourceKey.get(ref.src) : primaryAssetId;
    const sourceRef: CaptionSourceRef | undefined = ref && assetId
      ? { assetId, segmentIndex: ref.seg, wordStart: ref.w0, wordEnd: ref.w1 }
      : undefined;
    const id = uniqueClipId(block.id || `caption_${index + 1}`, usedIds);
    const previous = existingById.get(id);
    return {
      id,
      kind: 'caption',
      startFrame: secondsToTimelineFrames(block.startSec, document.canvas.fps),
      durationFrames: positiveDurationFrames(block.durationSec, document.canvas.fps),
      enabled: previous?.enabled ?? true,
      ...(previous?.linkGroupId ? { linkGroupId: previous.linkGroupId } : {}),
      block: stripBlockPlacement(block),
      managed: true,
      ...(sourceRef
        ? {
            sourceRef,
            anchor: {
              type: 'word' as const,
              assetId: sourceRef.assetId,
              segmentIndex: sourceRef.segmentIndex,
              wordIndex: sourceRef.wordStart,
              offsetFrames: 0,
            },
          }
        : { anchor: { type: 'timeline' as const } }),
    };
  });
  if (JSON.stringify(track.clips) === JSON.stringify(clips)) {
    return { ok: true, document, receipt: emptyCommandReceipt('captions.relay') };
  }

  const tracks = [...document.timeline.tracks];
  tracks[trackIndex] = { ...track, clips };
  const nextIds = new Set(clips.map((clip) => clip.id));
  const removedIds = new Set(track.clips.map((clip) => clip.id).filter((id) => !nextIds.has(id)));
  const next: EditorDocumentV2 = {
    ...document,
    timeline: { ...document.timeline, tracks },
    semantics: {
      ...document.semantics,
      scenes: removedIds.size
        ? document.semantics.scenes.map((scene) => ({ ...scene, clipIds: scene.clipIds.filter((id) => !removedIds.has(id)) }))
        : document.semantics.scenes,
    },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const priorIds = new Set(track.clips.map((clip) => clip.id));
  const receipt = emptyCommandReceipt('captions.relay');
  receipt.affectedTrackIds = [trackId];
  receipt.removedClipIds = [...removedIds];
  receipt.createdClipIds = clips.map((clip) => clip.id).filter((id) => !priorIds.has(id));
  return { ok: true, document: next, receipt };
}
