import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type {
  Composition,
  EditorDocumentV2,
  NarrativeTimelineClip,
} from '@pireel/studio-engine/composition';
import { firstNarrativeAssetId } from '@pireel/studio-engine/editor-document';

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

/**
 * Every transcript a whole-timeline caption operation (translation) reads, in the shape the relay
 * consumes: sourced shots by their runtime src, src-less narration through the main copy. The
 * document is the durable owner, so a restored project whose browser refs are empty still has its
 * script; the main copy is only supplied when a src-less shot needs it — handing one in otherwise
 * would let the caption command's main-owner rule overwrite the first source's clip copy.
 */
export function captionTranslationSources(
  document: EditorDocumentV2,
  composition: Composition,
  runtimeMain: readonly AsrSegment[] | null,
  runtimeClips: Readonly<Record<string, AsrSegment[]>>,
): { main: AsrSegment[] | null; clips: Record<string, AsrSegment[]> } {
  const { clips } = captionTranscriptsFromDocument(document, composition, runtimeClips);
  const shots = composition.shots ?? [];
  const needsMain = shots.length === 0 || shots.some((shot) => !shot.src);
  if (!needsMain) return { main: null, clips };
  const mainAssetId = firstNarrativeAssetId(document);
  const stored = mainAssetId ? document.semantics.transcripts[mainAssetId] : undefined;
  const main = stored?.length ? (stored as AsrSegment[]) : runtimeMain?.length ? [...runtimeMain] : null;
  return { main, clips };
}
