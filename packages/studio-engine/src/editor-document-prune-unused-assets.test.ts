import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document/create';
import { pruneUnusedEditorAssets } from './editor-document/prune-unused-assets';

function documentWithMainAsset() {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = {
    id: 'main', kind: 'video', locator: { localSig: 'main.mp4:2:1' }, metadata: { durationSec: 2 },
    library: { createdAt: 1 },
  };
  document.semantics.transcripts.main = [{ start: 0, end: 2, text: 'hello' }];
  return document;
}

describe('prune unused editor assets', () => {
  it('fully forgets a deleted final source after its last clip is gone', () => {
    const document = documentWithMainAsset();
    const result = pruneUnusedEditorAssets(document, ['main']);

    expect(result.removedAssetIds).toEqual(['main']);
    expect(result.document.assets).toEqual({});
    expect(result.document.semantics).not.toHaveProperty('primaryNarrativeAssetId');
    expect(result.document.semantics.transcripts).toEqual({});
  });

  it('retains a candidate while a timeline clip still references it', () => {
    const document = documentWithMainAsset();
    document.timeline.tracks[0]!.clips = [{
      id: 'still-used', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 60,
      sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' }, enabled: true,
    }];
    const result = pruneUnusedEditorAssets(document, ['main']);

    expect(result.removedAssetIds).toEqual([]);
    expect(result.document).toBe(document);
  });
});
