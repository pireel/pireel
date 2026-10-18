import { describe, expect, it, vi } from 'vitest';
import type { EditorMediaAsset } from '@pireel/studio-engine/editor-document';
import { resolveGenerationReferences } from '@pireel/studio-ui/generation-reference';

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

describe('source-frame identity reference', () => {
  it('uses source seconds and a clean decoded image, without a model call', async () => {
    const { resolveGenerationSourceFrame } = await import('@pireel/studio-ui/generation-reference');
    const file = new File(['video'], 'speaker.mp4');
    const blob = new Blob(['clean frame'], { type: 'image/jpeg' });
    const load = vi.fn(async () => ({ file }));
    const capture = vi.fn(async () => blob);
    const upload = vi.fn(async () => 'https://private.example/frame?signature');
    const assets = { speaker: { id: 'speaker', kind: 'video' as const, label: 'Speaker', locator: { localSig: 'sig' }, metadata: { durationSec: 20, width: 1080 } } };
    await expect(resolveGenerationSourceFrame({ assetId: 'speaker', sourceSec: 3.5 }, { assets, load, capture, upload })).resolves.toEqual({ assetId: 'speaker', sourceSec: 3.5, url: 'https://private.example/frame?signature' });
    expect(capture).toHaveBeenCalledWith(file, 3.5, 1080);
    expect(upload).toHaveBeenCalledWith(blob);
    for (const frame of [{ assetId: 'missing', sourceSec: 1 }, { assetId: 'speaker', sourceSec: 20 }, { assetId: 'speaker', sourceSec: -1 }, { assetId: 'speaker', sourceSec: '3' }]) await expect(resolveGenerationSourceFrame(frame, { assets, load, capture, upload })).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('blocks before generation when source bytes, frame upload or cancellation fails', async () => {
    const { resolveGenerationSourceFrame } = await import('@pireel/studio-ui/generation-reference');
    const assets = { speaker: { id: 'speaker', kind: 'video' as const, label: 'Speaker', locator: {}, metadata: { durationSec: 10 } } };
    const capture = vi.fn(async () => new Blob(['frame']));
    const upload = vi.fn(async () => null);
    const load = vi.fn(async () => ({ file: null, reason: 'Restore the source' }));
    const frame = { assetId: 'speaker', sourceSec: 1 };
    await expect(resolveGenerationSourceFrame(frame, { assets, load, capture, upload })).rejects.toThrow('Restore the source');
    expect(capture).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    const source = async () => ({ file: new File(['video'], 'source.mp4') });
    await expect(resolveGenerationSourceFrame(frame, { assets, load: source, capture, upload })).rejects.toThrow('fetchable source frame');
    const controller = new AbortController(); controller.abort();
    await expect(resolveGenerationSourceFrame(frame, { assets, load, capture, upload, signal: controller.signal })).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
