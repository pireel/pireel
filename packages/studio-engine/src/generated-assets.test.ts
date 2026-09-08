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
