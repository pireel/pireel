import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { LocalAssetIndexEntry, StudioProjectContext, TranscriptSegment } from '@pireel/studio-engine/project-dto';

export interface NativeProjectSessionMetadata {
  mainTranscript: TranscriptSegment[] | null;
  /** Runtime UI panels still address inserted sources by their projected URL. The persisted join is assetId. */
  clipTranscripts: Record<string, TranscriptSegment[]>;
  cloudMedia: { video?: { sig: string; key: string }; clips?: Record<string, { key: string }> };
  localAssets: LocalAssetIndexEntry[];
  plan?: unknown;
}

/** Read session caches from canonical V2 state. Nothing returned here is a second persisted truth. */
export function nativeProjectSessionMetadata(
  document: EditorDocumentV2,
  composition?: Composition,
): NativeProjectSessionMetadata {
  const primaryAssetId = document.semantics.primaryNarrativeAssetId;
  const primaryAsset = primaryAssetId ? document.assets[primaryAssetId] : undefined;
  const mainTranscript = primaryAssetId && document.semantics.transcripts[primaryAssetId]?.length
    ? document.semantics.transcripts[primaryAssetId]!
    : null;
  const primaryTrack = document.timeline.tracks.find(
    (track) => track.id === document.semantics.primaryNarrativeTrackId,
  );
  const sourceByClipId = new Map((composition?.shots ?? []).map((shot) => [shot.id, shot.src] as const));
  const clipTranscripts: Record<string, TranscriptSegment[]> = {};
  for (const clip of primaryTrack?.clips ?? []) {
    if (clip.kind !== 'narrative' || clip.assetId === primaryAssetId) continue;
    const segments = document.semantics.transcripts[clip.assetId];
    if (!segments?.length) continue;
    clipTranscripts[sourceByClipId.get(clip.id) ?? clip.assetId] = segments;
  }

  const cloudClips: Record<string, { key: string }> = {};
  const localAssets: LocalAssetIndexEntry[] = [];
  const referencedAssetIds = new Set(
    document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => (
      'assetId' in clip && clip.assetId ? [clip.assetId] : []
    ))),
  );
  for (const asset of Object.values(document.assets)) {
    const sig = asset.locator.localSig;
    const key = asset.locator.cloudKey;
    if (sig && key && asset.id !== primaryAssetId) cloudClips[sig] = { key };
    // A pre-v3 document may not have library metadata on imported footage. If a local source is
    // still used by this output it belongs to the project media directory regardless.
    if (sig && (asset.library || referencedAssetIds.has(asset.id))) {
      localAssets.push({
        sig,
        label: asset.label ?? sig,
        kind: asset.kind,
        w: asset.metadata.width ?? null,
        h: asset.metadata.height ?? null,
        ...(asset.library?.folder ? { folder: asset.library.folder } : {}),
        createdAt: asset.library?.createdAt ?? 0,
      });
    }
  }

  return {
    mainTranscript,
    clipTranscripts,
    cloudMedia: {
      ...(primaryAsset?.locator.localSig && primaryAsset.locator.cloudKey
        ? { video: { sig: primaryAsset.locator.localSig, key: primaryAsset.locator.cloudKey } }
        : {}),
      ...(Object.keys(cloudClips).length ? { clips: cloudClips } : {}),
    },
    localAssets: localAssets.sort((left, right) => right.createdAt - left.createdAt),
    ...(document.semantics.plan !== undefined ? { plan: document.semantics.plan } : {}),
  };
}

export function nativeProjectLocalAssets(document: EditorDocumentV2): LocalAssetIndexEntry[] {
  return nativeProjectSessionMetadata(document).localAssets;
}

/** Project-level media directory. The root context owns explicit library entries. Local sources
 * that are still referenced by any output are always merged in, so pre-v3 footage cannot vanish
 * merely because its asset record predates library metadata. The next autosave writes the union. */
export function nativeProjectSharedLocalAssets(
  activeDocument: EditorDocumentV2,
  context?: StudioProjectContext,
): LocalAssetIndexEntry[] {
  const documents = [activeDocument, ...(context?.outputs?.inactive.map((output) => output.document) ?? [])];
  const merged = new Map<string, LocalAssetIndexEntry>(
    (context?.localAssets ?? []).map((entry) => [entry.sig, entry]),
  );
  for (const document of documents) {
    for (const entry of nativeProjectLocalAssets(document)) {
      const previous = merged.get(entry.sig);
      if (!previous || entry.createdAt >= previous.createdAt) merged.set(entry.sig, entry);
    }
  }
  return [...merged.values()].sort((left, right) => right.createdAt - left.createdAt);
}
