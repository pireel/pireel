import { afterEach, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => ({ run: vi.fn(), inputDisposals: vi.fn(), outputDisposals: vi.fn(), created: [] as string[] }));
vi.mock('onnxruntime-web', () => ({
  env: { wasm: {}, versions: { web: 'test' } },
  InferenceSession: { create: async (url: string) => { model.created.push(url); return { run: model.run }; } },
  Tensor: class { constructor(public type: string, public data: Float32Array, public dims: number[]) {} dispose() { model.inputDisposals(); } },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules(); model.created.length = 0; });
function setup() {
  vi.stubGlobal('navigator', { gpu: {} });
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }), putImageData() {} }; }
    transferToImageBitmap() { return { width: this.width, height: this.height }; }
  });
}
/** A model answer: an alpha of `value` everywhere and memory tensors tagged with `tag`. */
function answer(value: number, tag: number) {
  const out = (dims: number[], fill: number) => ({ dims, getData: async () => new Float32Array(dims.reduce((a, b) => a * b, 1)).fill(fill), dispose: model.outputDisposals });
  return { pha: out([1, 1, 720, 1280], value), r1o: out([1, 16, 144, 256], tag), r2o: out([1, 20, 72, 128], tag), r3o: out([1, 40, 36, 64], tag), r4o: out([1, 64, 18, 32], tag) };
}

it('fits a frame into the model of its orientation, letterboxed and centred', async () => {
  const { rvmFit } = await import('./person-matte');
  expect(rvmFit(1920, 1080)).toEqual({ orientation: 'landscape', x: 0, y: 0, w: 1280, h: 720 });
  expect(rvmFit(1080, 1920)).toEqual({ orientation: 'portrait', x: 0, y: 0, w: 720, h: 1280 });
  expect(rvmFit(1440, 1080)).toEqual({ orientation: 'landscape', x: 160, y: 0, w: 960, h: 720 });
  expect(rvmFit(1080, 1080)).toEqual({ orientation: 'landscape', x: 280, y: 0, w: 720, h: 720 });
});

it('carries a stream on only to a frame shortly after its last one', async () => {
  const { continuesStream } = await import('./person-matte');
  expect(continuesStream(1, 1 + 1 / 15)).toBe(true);
  expect(continuesStream(1, 1)).toBe(false);
  expect(continuesStream(1, 0.5)).toBe(false);
  expect(continuesStream(1, 2)).toBe(false);
  expect(continuesStream(undefined, 1)).toBe(false);
});

it('mattes a still three times over, releases every tensor and returns a mask the frame’s shape', async () => {
  setup(); model.run.mockImplementation(async () => answer(1, 0));
  const { matteMask } = await import('./person-matte');
  const source = { width: 1440, height: 1080, close: vi.fn() } as unknown as ImageBitmap;
  expect(await matteMask(source)).toEqual({ width: 960, height: 720 });
  expect(model.created).toEqual([expect.stringContaining('/models/rvm/rvm_mb_1280x720.onnx')]);
  expect(model.run).toHaveBeenCalledTimes(3);
  expect(model.outputDisposals).toHaveBeenCalledTimes(15);
  expect(source.close).not.toHaveBeenCalled();
});

it('runs a stream once a frame, passing the memory on until the stream jumps', async () => {
  setup();
  let call = 0; model.run.mockImplementation(async () => answer(1, ++call));
  const { matteMask } = await import('./person-matte');
  const frame = { width: 1280, height: 720 } as ImageBitmap;
  await matteMask(frame, { id: 's', t: 0 });
  await matteMask(frame, { id: 's', t: 1 / 15 });
  await matteMask(frame, { id: 's', t: 5 });
  expect(model.run).toHaveBeenCalledTimes(3);
  const memoryOf = (at: number) => (model.run.mock.calls[at]![0] as Record<string, { data: Float32Array }>).r1i!.data[0];
  expect(memoryOf(0)).toBe(0);
  expect(memoryOf(1)).toBe(1);
  expect(memoryOf(2)).toBe(0);
});

it('releases tensors and drops the stream when readback fails, so later frames recover', async () => {
  setup(); model.run.mockResolvedValue({ ...answer(1, 0), pha: { dims: [1, 1, 720, 1280], getData: async () => { throw new Error('readback'); }, dispose: model.outputDisposals } });
  const { matteMask } = await import('./person-matte');
  expect(await matteMask({ width: 1280, height: 720 } as ImageBitmap, { id: 's', t: 0 })).toBeNull();
  expect(model.outputDisposals).toHaveBeenCalledTimes(5);
});
