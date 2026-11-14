import { describe, expect, it } from 'vitest';
import { generatedAssetIndexEntry, generatedRecordsFromJobs, mergeProjectLibraryEntries } from './generated-assets';

describe('generated assets in the project directory', () => {
  it('maps settled jobs to records, inferring kind from MIME when the job carries none', () => {
    const records = generatedRecordsFromJobs([
      { id: 'j1', status: 'succeeded', prompt: 'a bicycle', createdAt: 5, assets: [{ key: 'uploads/u/a.png', mime: 'image/png' }, { key: 'uploads/u/b.mp4', mime: 'video/mp4' }] },
      { id: 'j2', status: 'pending', prompt: 'x', createdAt: 6, assets: [{ key: 'uploads/u/c.png', mime: 'image/png' }] },
      { id: 'j3', status: 'succeeded', prompt: 'y', createdAt: 7, kind: 'audio', assets: [{ key: 'uploads/u/d.mp3' }, { mime: 'audio/mpeg' }] },
    ]);
    expect(records.map((record) => [record.jobId, record.index, record.kind, record.key])).toEqual([
      ['j1', 0, 'image', 'uploads/u/a.png'],
      ['j1', 1, 'video', 'uploads/u/b.mp4'],
      ['j3', 0, 'audio', 'uploads/u/d.mp3'],
    ]);
  });

  it('merges only unknown ids and keeps existing entries first-class', () => {
    const existing = [generatedAssetIndexEntry({ jobId: 'j1', index: 0, kind: 'image', key: 'k1', mime: 'image/png', prompt: 'old label', createdAt: 1 }, 'Image')];
    const incoming = [
      generatedAssetIndexEntry({ jobId: 'j1', index: 0, kind: 'image', key: 'k1', mime: 'image/png', prompt: 'renamed upstream', createdAt: 9 }, 'Image'),
      generatedAssetIndexEntry({ jobId: 'j2', index: 0, kind: 'video', key: 'k2', mime: 'video/mp4', prompt: '', createdAt: 2 }, 'Video'),
    ];
    const merged = mergeProjectLibraryEntries(existing, incoming);
    expect(merged?.map((entry) => [entry.assetId, entry.label])).toEqual([
      ['gen_j2_0', 'Video'],
      ['gen_j1_0', 'old label'],
    ]);
    expect(mergeProjectLibraryEntries(merged!, incoming)).toBeNull();
  });
});

describe('stock imports as directory entries', () => {
  it('lists an imported stock file under its own id, addressed by its stored copy', async () => {
    const { isStockAssetSig, stockAssetIndexEntry, stockAssetSig } = await import('./generated-assets');
    const entry = stockAssetIndexEntry({ id: 'up_1', kind: 'video', cloudKey: 'uploads/u/stock/pexels/px_1.mp4', label: 'factory floor · pexels', width: 1920, height: 1080, durationSec: 8.4 }, 1700);
    expect(entry).toEqual({
      assetId: 'up_1', contentSig: 'stock:uploads/u/stock/pexels/px_1.mp4', sig: 'stock:uploads/u/stock/pexels/px_1.mp4', cloudKey: 'uploads/u/stock/pexels/px_1.mp4',
      label: 'factory floor · pexels', kind: 'video', w: 1920, h: 1080, durationSec: 8.4, createdAt: 1700,
    });
    expect(isStockAssetSig(stockAssetSig('uploads/u/stock/pexels/px_1.mp4'))).toBe(true);
    expect(isStockAssetSig('gen:studio-sfx/a.mp3')).toBe(false);
    expect(stockAssetIndexEntry({ id: 'up_2', kind: 'image', cloudKey: 'k.jpg' }, 1)).toMatchObject({ kind: 'image', label: 'up_2', w: null });
  });

  it('is nothing without a stored copy', async () => {
    const { stockAssetIndexEntry } = await import('./generated-assets');
    expect(stockAssetIndexEntry({ id: 'up_3', kind: 'video' }, 1)).toBeNull();
    expect(stockAssetIndexEntry({ id: '', cloudKey: 'k.mp4' }, 1)).toBeNull();
  });
});

describe('adoptableStockAssets', () => {
  it('finds stock kept by its address alone, and leaves everything else', async () => {
    const { adoptableStockAssets } = await import('./generated-assets');
    const found = adoptableStockAssets({
      a: { id: 'a', kind: 'video', label: 'factory · pexels', locator: { cloudKey: 'uploads/u1/stock/pexels/px_1.mp4', remoteUrl: 'https://cdn/x.mp4' }, metadata: { tags: ['online-stock', 'pexels'], width: 1920, height: 1080 } },
      // No tag (an older import), but stored where stock is stored.
      b: { id: 'b', kind: 'image', locator: { cloudKey: 'uploads/u1/stock/wikimedia/w_2.jpg' } },
      // Already project media; the recording; a catalog sound; an address without a stored copy.
      c: { id: 'c', kind: 'video', locator: { cloudKey: 'uploads/u1/stock/pexels/px_3.mp4', localSig: 'stock:uploads/u1/stock/pexels/px_3.mp4' }, metadata: { tags: ['online-stock'] } },
      d: { id: 'd', kind: 'video', locator: { cloudKey: 'studio-src/u1/abc', localSig: 'pireel2:abc:1' } },
      e: { id: 'e', kind: 'audio', locator: { cloudKey: 'studio-sfx/u1/a.mp3', remoteUrl: 'https://cdn/a.mp3' } },
      f: { id: 'f', kind: 'video', locator: { remoteUrl: 'https://example.com/v.mp4' }, metadata: { tags: ['online-stock'] } },
    }, 5);
    expect(found.map((item) => [item.id, item.kind, item.localSig])).toEqual([
      ['a', 'video', 'stock:uploads/u1/stock/pexels/px_1.mp4'],
      ['b', 'image', 'stock:uploads/u1/stock/wikimedia/w_2.jpg'],
    ]);
    expect(found[0]!.entry).toMatchObject({ assetId: 'a', cloudKey: 'uploads/u1/stock/pexels/px_1.mp4', label: 'factory · pexels', kind: 'video', w: 1920, createdAt: 5 });
  });
});
