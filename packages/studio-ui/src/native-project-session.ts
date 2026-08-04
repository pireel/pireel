import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { LocalAssetIndexEntry, TranscriptSegment } from '@pireel/studio-engine/project-dto';

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
  for (const asset of Object.values(document.assets)) {
    const sig = asset.locator.localSig;
    const key = asset.locator.cloudKey;
    if (sig && key && asset.id !== primaryAssetId) cloudClips[sig] = { key };
    if (sig && asset.library) {
      localAssets.push({
        sig,
        label: asset.label ?? sig,
        kind: asset.kind,
        w: asset.metadata.width ?? null,
        h: asset.metadata.height ?? null,
        ...(asset.library.folder ? { folder: asset.library.folder } : {}),
        createdAt: asset.library.createdAt,
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
