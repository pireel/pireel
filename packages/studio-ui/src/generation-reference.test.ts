import { describe, expect, it, vi } from 'vitest';
import type { EditorMediaAsset } from '@pireel/studio-engine/editor-document';
import { resolveGenerationReferences } from './generation-reference';

const entry = (assetId: string, cloudKey?: string) => ({
  assetId,
  contentSig: `sig-${assetId}`,
  sig: `sig-${assetId}`,
  label: assetId,
  kind: 'image' as const,
  createdAt: 1,
  ...(cloudKey ? { cloudKey } : {}),
});

describe('generation references', () => {
  it('turns project asset ids into fetchable URLs and reports what it cannot fetch', async () => {
    const presign = vi.fn(async (key: string) => `https://r2.example/${key}?sig`);
    const documentAssets: Record<string, EditorMediaAsset> = {
      asset_doc: { id: 'asset_doc', kind: 'image', locator: { localSig: 's', cloudKey: 'studio-src/u/doc' }, metadata: {} },
      asset_remote: { id: 'asset_remote', kind: 'image', locator: { remoteUrl: 'https://cdn.example/x.png' }, metadata: {} },
    };
    const result = await resolveGenerationReferences(
      ['local_pub', '@local_priv', 'asset_doc', 'asset_remote', 'https://direct.example/a.jpg', 'blob:http://x/abc', 'local_missing', 7],
      {
        localAssets: [entry('local_pub', 'uploads/u/gen.png'), entry('local_priv', 'studio-src/u/priv'), entry('local_missing')],
        documentAssets,
        presign,
      },
      9,
    );
    expect(result.urls).toEqual([
      expect.stringContaining('uploads/u/gen.png'),
      'https://r2.example/studio-src/u/priv?sig',
      'https://r2.example/studio-src/u/doc?sig',
      'https://cdn.example/x.png',
      'https://direct.example/a.jpg',
    ]);
    expect(result.unresolved).toEqual(['blob:http://x/abc', 'local_missing']);
    expect(presign).toHaveBeenCalledTimes(2);
  });
});
