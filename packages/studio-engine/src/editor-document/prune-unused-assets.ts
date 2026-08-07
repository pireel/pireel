import type { EditorDocumentV2 } from './types';

export interface PruneUnusedEditorAssetsResult {
  document: EditorDocumentV2;
  removedAssetIds: string[];
}

/**
 * Forget explicitly deleted assets once no timeline item still depends on them.
 *
 * Asset deletion is distinct from clip deletion: removing the final clip must not silently erase a
 * reusable library item, while deleting that library item must not leave its manifest identity behind
 * as a missing-source restore card. Callers therefore pass only the asset ids the user deleted.
 */
export function pruneUnusedEditorAssets(
  document: EditorDocumentV2,
  candidateAssetIds: readonly string[],
): PruneUnusedEditorAssetsResult {
  const removable = new Set(candidateAssetIds.filter((assetId) => !!document.assets[assetId]));
  if (!removable.size) return { document, removedAssetIds: [] };

  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if ('assetId' in clip && clip.assetId) removable.delete(clip.assetId);
      if ('anchor' in clip && clip.anchor.type === 'word') removable.delete(clip.anchor.assetId);
      if (clip.kind === 'caption' && clip.sourceRef) removable.delete(clip.sourceRef.assetId);
    }
  }
  if (!removable.size) return { document, removedAssetIds: [] };

  const assets = Object.fromEntries(
    Object.entries(document.assets).filter(([assetId]) => !removable.has(assetId)),
  );
  const transcripts = Object.fromEntries(
    Object.entries(document.semantics.transcripts).filter(([assetId]) => !removable.has(assetId)),
  );
  const semantics = { ...document.semantics, transcripts };
  if (semantics.primaryNarrativeAssetId && removable.has(semantics.primaryNarrativeAssetId)) {
    delete semantics.primaryNarrativeAssetId;
  }

  return {
    document: { ...document, assets, semantics },
    removedAssetIds: [...removable],
  };
}
