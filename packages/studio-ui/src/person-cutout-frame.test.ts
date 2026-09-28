import { afterEach, expect, it, vi } from 'vitest';
import { personCutoutFrame } from './person-cutout-frame';
const segment = vi.hoisted(() => vi.fn());
vi.mock('./geometry', () => ({ segmentPersonMask: segment }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('composites soft alpha onto source pixels and releases input and mask ownership', async () => {
  const frame = { width: 640, height: 360, close: vi.fn() } as unknown as ImageBitmap;
  const mask = { close: vi.fn() }; const clone = {}; const output = {};
  const ctx = { drawImage: vi.fn(), globalCompositeOperation: 'source-over' };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(clone));
  vi.stubGlobal('OffscreenCanvas', class { getContext() { return ctx; } transferToImageBitmap() { return output; } });
  segment.mockResolvedValue(mask);
  expect(await personCutoutFrame(frame)).toBe(output);
  expect(segment).toHaveBeenCalledWith(clone);
  expect(ctx.globalCompositeOperation).toBe('destination-in');
  expect(ctx.drawImage.mock.calls).toEqual([[frame, 0, 0], [mask, 0, 0, 640, 360]]);
  expect(frame.close).toHaveBeenCalledOnce(); expect(mask.close).toHaveBeenCalledOnce();
});
it('fails explicitly when segmentation cannot run instead of exporting a rectangular presenter', async () => {
  const frame = { close: vi.fn() } as unknown as ImageBitmap;
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({})); segment.mockResolvedValue(null);
  await expect(personCutoutFrame(frame)).rejects.toThrow('人像抠图暂不可用');
  expect(frame.close).toHaveBeenCalledOnce();
});
