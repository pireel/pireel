import { describe, expect, it } from 'vitest';
import { assetSearchCardItems } from './chat-asset-search-results';

describe('assetSearchCardItems', () => {
  it('keeps only the display-safe subset of search results', () => {
    const items = assetSearchCardItems({
      ok: true,
      data: {
        results: [
          {
            assetId: 'sticker:ocean',
            label: 'Ocean',
            kind: 'image',
            scope: 'official',
            origin: 'sticker',
            locator: {
              url: 'https://cdn.example/ocean.png',
              thumbUrl: 'https://cdn.example/ocean-thumb.png',
              component: 'ignored-component',
              templateId: 'el-big-number',
              elementId: 'saved-1',
              prompt: 'ignored',
            },
            fields: { description: '<script>ignored</script>' },
          },
          { assetId: 'bad', label: 'Bad', kind: 'document', scope: 'official' },
        ],
      },
    });

    expect(items).toEqual([
      {
        assetId: 'sticker:ocean',
        label: 'Ocean',
        kind: 'image',
        scope: 'official',
        origin: 'sticker',
        locator: {
          url: 'https://cdn.example/ocean.png',
          thumbUrl: 'https://cdn.example/ocean-thumb.png',
          component: 'ignored-component',
          templateId: 'el-big-number',
          elementId: 'saved-1',
        },
      },
    ]);
  });

  it('returns an empty list for malformed receipts', () => {
    expect(assetSearchCardItems(null)).toEqual([]);
    expect(assetSearchCardItems({ data: { results: 'not-an-array' } })).toEqual([]);
  });
});
