import { describe, expect, it, vi } from 'vitest';
import { hydrateFrameImages } from './mcp';

describe('hydrateFrameImages', () => {
  it('reads keyed frames into image bytes and counts the ones it cannot read', async () => {
    const readFrameImage = vi.fn(async (key: string) => (key === 'studio-src/u/ok' ? { data: 'QUJD', mimeType: 'image/jpeg' } : null));
    const result = await hydrateFrameImages({
      ok: true,
      summary: 'two frames',
      images: [
        { key: 'studio-src/u/ok', mimeType: 'image/jpeg' },
        { key: 'studio-src/u/missing', mimeType: 'image/jpeg' },
        { data: 'REVG', mimeType: 'image/png' },
      ],
    }, { readFrameImage });
    expect(result.images).toEqual([
      { data: 'QUJD', mimeType: 'image/jpeg' },
      { data: 'REVG', mimeType: 'image/png' },
    ]);
    expect(result.framesUnavailable).toBe(1);
    expect(readFrameImage).toHaveBeenCalledTimes(2);
  });

  it('drops a single keyed frame that has no reader instead of leaking the key as an image', async () => {
    const result = await hydrateFrameImages({ ok: true, image: { key: 'studio-src/u/x', mimeType: 'image/jpeg' } }, {});
    expect(result.image).toBeUndefined();
    expect(result.framesUnavailable).toBe(1);
  });

  it('leaves errors and image-free results untouched', async () => {
    const failed = { ok: false, error: 'nope' };
    expect(await hydrateFrameImages(failed, {})).toBe(failed);
    const plain = { ok: true, data: { a: 1 } };
    expect(await hydrateFrameImages(plain, {})).toEqual(plain);
  });
});
