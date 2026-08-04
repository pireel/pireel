import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type {
  Composition,
  EditorDocumentV2,
  NarrativeTimelineClip,
} from '@pireel/studio-engine/composition';

/**
 * Add stable asset-id aliases for legacy runtime transcript keys before a native caption command.
 * Runtime blob URLs belong to the session and are deliberately absent from the V2 asset manifest;
 * clip identity is the durable join between the projected shot and its narrative asset.
 */
export function captionTranscriptsByAsset(
  document: EditorDocumentV2,
  composition: Composition,
  transcripts: Readonly<Record<string, readonly AsrSegment[]>>,
): Record<string, readonly AsrSegment[]> {
  const primary = document.timeline.tracks.find(
    (track) => track.id === document.semantics.primaryNarrativeTrackId,
  );
  const assetIdByClipId = new Map(
    (primary?.clips ?? [])
      .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
      .map((clip) => [clip.id, clip.assetId] as const),
  );
  const bridged = { ...transcripts };
  for (const shot of composition.shots ?? []) {
    if (!shot.src) continue;
    const assetId = assetIdByClipId.get(shot.id);
    const segments = transcripts[shot.src];
    if (assetId && segments?.length) bridged[assetId] = segments;
  }
  return bridged;
}
