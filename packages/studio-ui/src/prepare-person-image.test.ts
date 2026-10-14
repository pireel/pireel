import { afterEach, expect, it, vi } from 'vitest';
import { alphaBounds, preparePersonImage } from './prepare-person-image';
it('trims transparent margins without including faint mask noise', () => {
  const data = new Uint8ClampedArray(10 * 10 * 4);
  data[3] = 12;
  for (let y = 2; y <= 8; y++) for (let x = 3; x <= 6; x++) data[(y * 10 + x) * 4 + 3] = 200;
  expect(alphaBounds(data, 10, 10)).toEqual({ x: 3, y: 2, width: 4, height: 7 });
  expect(() => alphaBounds(new Uint8ClampedArray(400), 10, 10)).toThrow('No usable person');
});

const cutout = vi.hoisted(() => vi.fn());
vi.mock('./person-cutout-frame', () => ({ personCutoutFrame: cutout }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('preserves original color resolution above 1024 instead of shrinking portraits before matting', async () => {
  const original = { width: 2400, height: 1600, close: vi.fn() };
  const alpha = { ...original, close: vi.fn() };
  const pixels = new Uint8ClampedArray(2400 * 1600 * 4);
  // A solid 1200×1000 subject within a larger original photograph.
  for (let y = 300; y < 1300; y++) for (let x = 600; x < 1800; x++) pixels[(y * 2400 + x) * 4 + 3] = 255;
  const bitmap = vi.fn().mockResolvedValue(original);
  vi.stubGlobal('createImageBitmap', bitmap);
  cutout.mockResolvedValue(alpha);
  const drawImage = vi.fn();
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { drawImage, getImageData: () => ({ data: pixels }) }; }
    async convertToBlob() { return new Blob(['png'], { type: 'image/png' }); }
  });
  const result = await preparePersonImage(new File(['photo'], 'portrait.jpg'));
  expect(bitmap).toHaveBeenCalledTimes(1);
  expect(cutout).toHaveBeenCalledWith(original);
  expect(result).toMatchObject({ width: 1200, height: 1000, bounds: { x: 600, y: 300 } });
  expect(alpha.close).toHaveBeenCalledOnce();
});
