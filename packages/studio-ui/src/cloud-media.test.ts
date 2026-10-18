import { beforeEach as configureHttpHost, afterEach as restoreHttpHost } from 'vitest';
import { studioProviders, setStudioProviders } from '@pireel/studio-engine/providers';
let previousHttpHost: ReturnType<typeof studioProviders>;
configureHttpHost(() => {
  previousHttpHost = studioProviders();
  setStudioProviders({ ...previousHttpHost, request: (input, init) => init === undefined ? fetch(input) : fetch(input, init) });
});
restoreHttpHost(() => setStudioProviders(previousHttpHost));
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudBackupMedia, cloudMediaPreviewUrl, MULTIPART_THRESHOLD_BYTES } from '@pireel/studio-ui/cloud-media';

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

  describe('large files', () => {
    const partSize = 32 * 1024 * 1024;
    const big = () => new File([new Uint8Array(MULTIPART_THRESHOLD_BYTES + 1)], 'render.mp4', { type: 'video/mp4' });
    const parts = Math.ceil((MULTIPART_THRESHOLD_BYTES + 1) / partSize);
    const media = (handle: (body: Record<string, unknown>) => Response | undefined) => vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/studio/media') {
        const body = JSON.parse(init!.body as string) as Record<string, unknown>;
        return handle(body) ?? (body.action === 'multipart-start'
          ? Response.json({ key: 'studio-src/u/k', uploadId: 'up1', partSize, urls: Array.from({ length: parts }, (_, index) => `https://r2.example/part${index + 1}`) })
          : Response.json({ key: 'studio-src/u/k', ok: true }));
      }
      return new Response(null, { status: 200 });
    });
    afterEach(() => vi.useRealTimers());

    it('uploads in parts, retries a dropped part and completes server-side', async () => {
      vi.useFakeTimers();
      let dropped = false;
      const fetch = media(() => undefined);
      const put = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (input, init) => {
        if (String(input) === 'https://r2.example/part2' && !dropped) { dropped = true; throw new TypeError('Failed to fetch'); }
        return put(input, init);
      });
      vi.stubGlobal('fetch', fetch);
      const progress: number[] = [];
      const pending = cloudBackupMedia(big(), 'sig', { onProgress: value => progress.push(value) });
      await vi.runAllTimersAsync();
      expect(await pending).toEqual({ key: 'studio-src/u/k' });
      const actions = fetch.mock.calls.filter(([input]) => String(input) === '/api/studio/media').map(([, init]) => JSON.parse(init!.body as string).action);
      expect(actions).toEqual(['multipart-start', 'multipart-complete']);
      expect(fetch.mock.calls.filter(([input]) => String(input) === 'https://r2.example/part2')).toHaveLength(2);
      expect(progress.at(-1)).toBe(1);
    });

    it('aborts the upload and reports failure when a part keeps failing', async () => {
      vi.useFakeTimers();
      const fetch = media(() => undefined);
      const put = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (input, init) => String(input) === 'https://r2.example/part1' ? new Response(null, { status: 500 }) : put(input, init));
      vi.stubGlobal('fetch', fetch); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pending = cloudBackupMedia(big(), 'sig');
      await vi.runAllTimersAsync();
      expect(await pending).toBeNull();
      const actions = fetch.mock.calls.filter(([input]) => String(input) === '/api/studio/media').map(([, init]) => JSON.parse(init!.body as string).action);
      expect(actions).toEqual(['multipart-start', 'multipart-abort']);
      expect(warn).toHaveBeenCalledWith('[cloud-media] backup failed', expect.stringContaining('part 1/'));
      warn.mockRestore();
    });
  });
});
