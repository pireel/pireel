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

/**
 * Caption copy is persisted in the editor document, while the browser ASR refs are only a runtime
 * cache. Restored projects therefore must fall back to the durable transcript instead of asking
 * the user to read/transcribe the already-known script again.
 */
export function captionTranscriptForEdit(
  document: EditorDocumentV2,
  assetId: string,
  runtimeSegments: readonly AsrSegment[] | null | undefined,
): AsrSegment[] | undefined {
  if (runtimeSegments?.length) return runtimeSegments as AsrSegment[];
  const stored = document.semantics.transcripts[assetId];
  return stored?.length ? stored as AsrSegment[] : undefined;
}

/** Project document → browser runtime transcript refs after an engine-owned re-layout rewrites
 * cueLayout/cueTexts. Runtime source URLs are recovered through the projected shot's clip id. */
export function captionTranscriptsFromDocument(
  document: EditorDocumentV2,
  composition: Composition,
  currentClipTranscripts: Readonly<Record<string, AsrSegment[]>>,
): { main: AsrSegment[] | null; clips: Record<string, AsrSegment[]> } {
  const primary = document.timeline.tracks.find(
    (track) => track.id === document.semantics.primaryNarrativeTrackId,
  );
  const assetIdByClipId = new Map(
    (primary?.clips ?? [])
      .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
      .map((clip) => [clip.id, clip.assetId] as const),
  );
  const clips = { ...currentClipTranscripts };
  for (const shot of composition.shots ?? []) {
    if (!shot.src) continue;
    const assetId = assetIdByClipId.get(shot.id);
    const segments = assetId ? document.semantics.transcripts[assetId] : undefined;
    if (segments) clips[shot.src] = segments as AsrSegment[];
  }
  return { main: null, clips };
}
