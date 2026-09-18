import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudBackupMedia, cloudMediaPreviewUrl } from './cloud-media';

afterEach(() => vi.unstubAllGlobals());

describe('cloud media transport', () => {
  it.each([
    ['picture.avif', 'image/avif'], ['picture.bmp', 'image/bmp'],
    ['music.flac', 'audio/flac'], ['music.opus', 'audio/ogg'], ['music.aac', 'audio/aac'],
    ['clip.webm', 'video/webm'], ['clip.mkv', 'video/x-matroska'],
  ])('preserves media type for an empty-MIME picker file %s', async (name, contentType) => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ key: 'key', already: true }));
    vi.stubGlobal('fetch', fetch);
    await cloudBackupMedia(new File(['media'], name), 'sig');
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toMatchObject({ content_type: contentType });
  });

  it('gets a thumbnail link without fetching the media bytes', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ url: 'https://signed.example/media' }));
    vi.stubGlobal('fetch', fetch);
    const key = `studio-src/user/${'a'.repeat(64)}`;
    expect(await cloudMediaPreviewUrl('sig', { cloudKey: key })).toBe('https://signed.example/media');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/studio/media', expect.objectContaining({ body: JSON.stringify({ action: 'get', sig: 'sig', key }) }));
  });
});
