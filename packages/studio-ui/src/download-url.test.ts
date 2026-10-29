// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { downloadName, downloadUrl } from './use-export';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('names a download from its file, keeping the extension', () => {
  expect(downloadName('https://cdn.test/creations/u/abc.png?w=1', 'pireel-image-1')).toBe('pireel-image-1.png');
  expect(downloadName('https://cdn.test/v/clip.mp4', 'pireel-video-2')).toBe('pireel-video-2.mp4');
  expect(downloadName('https://cdn.test/raw', 'file')).toBe('file');
});
it('saves a file from another origin instead of opening it, and opens it when it cannot be read', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('png', { status: 200 })));
  URL.createObjectURL = vi.fn(() => 'blob:saved'); URL.revokeObjectURL = vi.fn();
  const clicked: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  await downloadUrl('https://cdn.test/a.png', 'pireel-image-1.png');
  expect(clicked).toEqual(['pireel-image-1.png']); expect(open).not.toHaveBeenCalled();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('blocked'); }));
  await downloadUrl('https://cdn.test/a.png', 'pireel-image-1.png');
  expect(open).toHaveBeenCalledWith('https://cdn.test/a.png', '_blank', 'noopener');
});
