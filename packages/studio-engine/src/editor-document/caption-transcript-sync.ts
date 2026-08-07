import type { AsrSegment } from '../build-blocks';
import type { EditorDocumentV2, NarrativeTimelineClip } from './types';

function sameTranscript(left: readonly AsrSegment[] | undefined, right: readonly AsrSegment[]): boolean {
  return left === right || JSON.stringify(left ?? []) === JSON.stringify(right);
}

/** Browser transcript refs can lag cuts/style transactions. Once the document owns a materialized
 * cue layout it is authoritative; explicit unlocking happens inside applyCaptionDocumentEdit. */
function withDocumentLayout(existing: readonly AsrSegment[] | undefined, incoming: readonly AsrSegment[]): AsrSegment[] {
  return incoming.map((segment, index) => (
    existing?.[index]?.cueLayout === undefined
      ? segment
      : { ...segment, cueLayout: existing[index]!.cueLayout }
  ));
}

/**
 * Fold temporary browser/server transcript inputs into V2 semantic ownership before a native
 * managed-caption command runs. Asset identity, not track position or a projected shot URL, is the
 * durable join key.
 */
export function syncCaptionTranscripts(
  document: EditorDocumentV2,
  mainTranscript: readonly AsrSegment[] | null,
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>,
): EditorDocumentV2 {
  const narrative = document.timeline.tracks
    .find((track) => track.id === document.semantics.primaryNarrativeTrackId)
    ?.clips.filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative') ?? [];
  const narrativeAssetIds = new Set(narrative.map((clip) => clip.assetId));
  const assetBySourceKey = new Map<string, string>();
  for (const assetId of narrativeAssetIds) {
    assetBySourceKey.set(assetId, assetId);
    const url = document.assets[assetId]?.locator.remoteUrl;
    if (url) assetBySourceKey.set(url, assetId);
    assetBySourceKey.set(`blob:pireel-offline/${assetId}`, assetId);
  }
  const managedTrack = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)
    : undefined;
  for (const clip of managedTrack?.clips ?? []) {
    if (clip.kind !== 'caption' || !clip.sourceRef) continue;
    const ref = clip.block.slots.ref as { src?: unknown } | undefined;
    if (typeof ref?.src === 'string' && ref.src) assetBySourceKey.set(ref.src, clip.sourceRef.assetId);
  }

  let changed = false;
  const transcripts = { ...document.semantics.transcripts };
  const mainAssetId = document.semantics.primaryNarrativeAssetId;
  if (mainAssetId && mainTranscript?.length) {
    const merged = withDocumentLayout(transcripts[mainAssetId] as AsrSegment[] | undefined, mainTranscript);
    if (!sameTranscript(transcripts[mainAssetId], merged)) {
      transcripts[mainAssetId] = merged;
      changed = true;
    }
  }
  for (const [sourceKey, segments] of Object.entries(clipTranscripts)) {
    const assetId = assetBySourceKey.get(sourceKey);
    if (!assetId || !narrativeAssetIds.has(assetId) || !segments.length) continue;
    const merged = withDocumentLayout(transcripts[assetId] as AsrSegment[] | undefined, segments);
    if (sameTranscript(transcripts[assetId], merged)) continue;
    transcripts[assetId] = merged;
    changed = true;
  }
  if (!changed) return document;
  return { ...document, semantics: { ...document.semantics, transcripts } };
}
