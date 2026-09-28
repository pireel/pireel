import { afterEach, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => ({ run: vi.fn(), inputDisposals: vi.fn(), outputDisposals: vi.fn() }));
vi.mock('onnxruntime-web', () => ({
  env: { wasm: {}, versions: { web: 'test' } },
  InferenceSession: { create: async () => ({ inputNames: ['input'], outputNames: ['alpha'], run: model.run }) },
  Tensor: class { dispose() { model.inputDisposals(); } },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules(); });
function setup() {
  vi.stubGlobal('navigator', { gpu: {} });
  vi.stubGlobal('ImageData', class {});
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }), putImageData() {} }; }
    transferToImageBitmap() { return { width: this.width, height: this.height }; }
  });
}
it('disposes model input/output tensors on every frame and keeps source ownership with caller', async () => {
  setup(); model.run.mockResolvedValue({ alpha: { getData: async () => new Float32Array(32 * 32), dispose: model.outputDisposals } });
  const { matteMask } = await import('./person-matte');
  const source = { width: 32, height: 32, close: vi.fn() } as unknown as ImageBitmap;
  for (let i = 0; i < 3; i++) expect(await matteMask(source)).toEqual({ width: 32, height: 32 });
  expect(model.inputDisposals).toHaveBeenCalledTimes(3); expect(model.outputDisposals).toHaveBeenCalledTimes(3);
  expect(source.close).not.toHaveBeenCalled();
});
it('releases tensors even when model readback fails so subsequent frames can recover', async () => {
  setup(); model.run.mockResolvedValue({ alpha: { getData: async () => { throw new Error('readback'); }, dispose: model.outputDisposals } });
  const { matteMask } = await import('./person-matte');
  expect(await matteMask({ width: 32, height: 32 } as ImageBitmap)).toBeNull();
  expect(model.inputDisposals).toHaveBeenCalledOnce(); expect(model.outputDisposals).toHaveBeenCalledOnce();
});
