import { describe, expect, it } from 'vitest';
import { bgmSearchTags, officialStickerSearchTags, searchAssetLibrary, type AssetSearchDocument } from './asset-search';

const docs: AssetSearchDocument[] = [
  {
    assetId: 'local_1', scope: 'mine', kind: 'video', origin: 'local', label: '产品演示.mov', createdAt: 30,
    locator: { sig: 'sig_1' }, availability: 'device-only',
  },
  {
    assetId: 'up_1', scope: 'cloud', kind: 'image', origin: 'upload', label: 'Dashboard hero', createdAt: 20,
    fields: { description: 'Blue analytics product screen' }, locator: { url: 'https://cdn.example/dashboard.png' },
  },
  {
    assetId: 'bgm_1', scope: 'official', kind: 'audio', origin: 'bgm', label: 'Morning Steps', createdAt: 0,
    fields: { category: '轻快正向 Upbeat', tags: bgmSearchTags('high', ['happy', 'bright'], ['tutorial']), moods: ['happy', 'bright'], useCases: ['tutorial'], artist: 'Studio' },
    locator: { url: 'https://cdn.example/music.mp3' },
  },
  {
    assetId: 'tpl_1', scope: 'official', kind: 'element', origin: 'template', label: '三步流程', createdAt: 0,
    fields: { prompt: '生成一个三步流程组件', tags: ['process', '步骤'] }, locator: { templateId: 'three-steps' },
  },
];

describe('searchAssetLibrary', () => {
  it('ranks exact labels ahead of descriptive-field matches and keeps action locators', () => {
    const result = searchAssetLibrary(docs, { query: 'dashboard', scope: 'cloud' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.results[0]).toMatchObject({ assetId: 'up_1', matchedFields: expect.arrayContaining(['label']), locator: { url: 'https://cdn.example/dashboard.png' } });
    expect(result.coverage).toMatchObject({ total: 1, byScope: { cloud: 1 } });
  });

  it('matches Chinese aliases and rich official music metadata without a model call', () => {
    const music = searchAssetLibrary(docs, { query: '口播配乐', kind: 'audio' });
    expect('error' in music).toBe(false);
    if ('error' in music) return;
    expect(music.results[0]).toMatchObject({ assetId: 'bgm_1', scope: 'official', kind: 'audio' });
    expect(music.results[0]?.matchedFields).toEqual(expect.arrayContaining(['tags', 'kind']));
  });

  it('enriches official sticker labels with deterministic bilingual visual terms', () => {
    const beach: AssetSearchDocument = {
      assetId: 'sticker_beach', scope: 'official', kind: 'image', origin: 'sticker', label: 'Beach With Umbrella',
      fields: { tags: officialStickerSearchTags('Beach With Umbrella', ['3D']) },
    };
    const result = searchAssetLibrary([beach], { query: '大海', kind: 'image' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.results[0]).toMatchObject({ assetId: 'sticker_beach', matchedFields: expect.arrayContaining(['tags']) });
    expect(result.results[0]!.score).toBeGreaterThanOrEqual(60);
  });

  it('filters scope and kind before ranking, clamps limit, and rejects blank queries', () => {
    const result = searchAssetLibrary(docs, { query: '流程', scope: 'official', kind: 'element', limit: 99 });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.results.map((item) => item.assetId)).toEqual(['tpl_1']);
    expect(searchAssetLibrary(docs, { query: '  ' })).toEqual({ error: 'query required' });
  });
});
