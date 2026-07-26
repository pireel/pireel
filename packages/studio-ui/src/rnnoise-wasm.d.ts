/** Minimal typings for @jitsi/rnnoise-wasm (no upstream types). We deep-import ONLY the sync
 *  variant: it embeds the wasm as base64 (self-contained, no asset plumbing under Vite);
 *  the async variant fetches rnnoise.wasm relative to the module URL, which bundlers break. */
declare module '@jitsi/rnnoise-wasm/dist/rnnoise-sync' {
  export interface RnnoiseModule {
    _rnnoise_create(): number;
    _rnnoise_destroy(state: number): void;
    /** 480-sample frames at 48 kHz; samples are floats scaled to the int16 range. Returns VAD probability. */
    _rnnoise_process_frame(state: number, outPtr: number, inPtr: number): number;
    _malloc(bytes: number): number;
    _free(ptr: number): void;
    HEAPF32: Float32Array;
  }
  const createRNNWasmModuleSync: () => Promise<RnnoiseModule>;
  export default createRNNWasmModuleSync;
}
