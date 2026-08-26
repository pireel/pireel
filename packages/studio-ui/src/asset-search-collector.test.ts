import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  listStudioGens: vi.fn(),
  listElements: vi.fn(),
  loadElementEntries: vi.fn(),
}));

vi.mock('./gen-api', () => ({ listStudioGens: deps.listStudioGens }));
vi.mock('./element-history', () => ({ loadElementEntries: deps.loadElementEntries }));
vi.mock('./gen-templates', () => ({ ELEMENT_TEMPLATES: [], localizedTemplatePrompt: vi.fn() }));
vi.mock('./i18n', () => ({ studioLocale: () => 'zh', t: (key: string) => key }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ elements: { list: deps.listElements } }) }));

import { collectAssetSearchDocuments } from './asset-search-collector';

describe('collectAssetSearchDocuments scope boundary', () => {
  beforeEach(() => {
    deps.listStudioGens.mockReset();
    deps.listElements.mockReset();
    deps.loadElementEntries.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not read cloud or official catalogs for a mine-only search', async () => {
    const documents = await collectAssetSearchDocuments(
      'p1',
      [{ assetId: 'poster-asset', contentSig: 'poster:1:2', sig: 'poster:1:2', label: '活动海报.jpg', kind: 'image', createdAt: 2 }],
      'mine',
    );

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      assetId: 'local:poster-asset',
      scope: 'mine',
      label: '活动海报.jpg',
    });
    expect(documents[0]).not.toHaveProperty('locator');
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.listStudioGens).not.toHaveBeenCalled();
    expect(deps.listElements).not.toHaveBeenCalled();
    expect(deps.loadElementEntries).not.toHaveBeenCalled();
  });

  it('indexes reusable Foley metadata from the cross-project audio library', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json({
      items: url.includes('kind=audio') ? [{
        id: 'up_foley', url: 'uploads/u1/box.m4a', thumb_url: null,
        label: 'Cardboard unboxing close', kind: 'audio', width: null, height: null,
        description: 'MMAudio V2 Foley · event=unboxing · material=cardboard · reuse=timing-compatible',
        source_url: 'https://cdn.example/mmaudio-result.mp4', created_at: 10,
      }] : [],
    })));
    deps.listStudioGens.mockResolvedValue([]);
    deps.listElements.mockResolvedValue([]);
    deps.loadElementEntries.mockReturnValue([]);

    const documents = await collectAssetSearchDocuments('p1', [], 'cloud');
    expect(documents.find((item) => item.assetId === 'up_foley')).toMatchObject({
      kind: 'audio',
      fields: {
        description: expect.stringContaining('material=cardboard'),
        source: 'https://cdn.example/mmaudio-result.mp4',
      },
    });
  });
});
