import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { firstNarrativeAssetId } from '@pireel/studio-engine/editor-document';
import { canonicalJson } from '@pireel/studio-engine/stable-json';

export interface RuntimeTranscripts {
  /** The first narrative asset's transcript, as the script panel and caption relay read it. */
  main: AsrSegment[] | null;
  /** Inserted-source transcripts keyed by the projected shot's runtime src (or the asset id). */
  clips: Record<string, AsrSegment[]>;
}

/**
 * Runtime transcript copies follow the document. The document owns every transcript (ASR results,
 * agent edits, cue edits, a rebase onto the server copy all land there); the browser keeps copies
 * only for panel UI keyed the way the legacy relay reads them. This computes the copies that match
 * the document, or null when nothing differs, so a stale copy is never re-imposed on the next relay
 * and a copy that was never seeded (a transcript that arrived through a tool) is adopted.
 */
export function runtimeTranscriptsFollowingDocument(
  document: EditorDocumentV2,
  composition: Composition,
  current: RuntimeTranscripts,
): RuntimeTranscripts | null {
  const nextClips = { ...current.clips };
  let clipsChanged = false;
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const sourceByClipId = new Map((composition.shots ?? []).map((shot) => [shot.id, shot.src] as const));
  // A runtime copy may sit under any alias of the asset (the asset id itself before a composition
  // existed, the offline blob key, the remote URL, the projected shot src): every alias follows.
  const aliasesByAsset = new Map<string, Set<string>>();
  // The keys the legacy session metadata seeds: an inserted source under its projected src, a
  // src-less narrative clip under its asset id. Every other alias follows only once present.
  const seeded = new Set<string>();
  for (const clip of primary?.clips ?? []) {
    if (clip.kind !== 'narrative') continue;
    const aliases = aliasesByAsset.get(clip.assetId) ?? new Set<string>();
    aliases.add(clip.assetId);
    aliases.add(`blob:pireel-offline/${clip.assetId}`);
    const remoteUrl = document.assets[clip.assetId]?.locator.remoteUrl;
    if (remoteUrl) aliases.add(remoteUrl);
    const source = sourceByClipId.get(clip.id);
    if (source) aliases.add(source);
    aliasesByAsset.set(clip.assetId, aliases);
    if (document.semantics.transcripts[clip.assetId]?.length) seeded.add(source ?? clip.assetId);
  }
  for (const [assetId, aliases] of aliasesByAsset) {
    const segments = document.semantics.transcripts[assetId] as AsrSegment[] | undefined;
    if (!segments?.length) continue;
    for (const alias of aliases) {
      if (!(alias in nextClips) && !seeded.has(alias)) continue;
      if (canonicalJson(nextClips[alias] ?? null) === canonicalJson(segments)) continue;
      nextClips[alias] = segments;
      clipsChanged = true;
    }
  }
  const mainId = firstNarrativeAssetId(document);
  const main = mainId ? (document.semantics.transcripts[mainId] as AsrSegment[] | undefined) : undefined;
  const mainChanged = !!main?.length && canonicalJson(current.main ?? null) !== canonicalJson(main);
  if (!clipsChanged && !mainChanged) return null;
  return { main: mainChanged ? main! : current.main, clips: clipsChanged ? nextClips : current.clips };
}
