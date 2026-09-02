/**
 * Single source of truth for the heavy person-matte asset URLs (ort wasm 27M + MODNet
 * 26M). These assets are intentionally requested only by person-matte when the feature
 * is used, so opening Studio does not eagerly download roughly 53 MB.
 *
 * ?v= is a cache stamp: assets are served `immutable` with a one-year cache, invalidated
 * only by URL change — same stamp always hits cache, an upgrade bumps the stamp and
 * auto-refetches, so there's no "cached old engine paired with new loader" mismatch window.
 *
 * Two serving sources (setMatteAssetBase, injected by the shell):
 *  - Default = same-origin /ort /models (dev's public/ real files; prod proxied from R2
 *    by server.ts as a fallback). The same-origin proxy response is built fresh by the
 *    Worker — **not edge-cached** — so a browser cache miss fully passes through; fallback only.
 *  - Injected CDN base (Pireel prod = cdn.pireel.com/static) = R2 custom domain direct:
 *    edge cache works, etag/range support, doesn't tax the Worker. ort officially supports
 *    cross-origin wasmPaths (CORS already allowed on the bucket).
 *
 * Always returns **absolute URLs**: bare paths get intercepted by Vite dev's import
 * rewrite with ?import (public assets must not go through the module pipeline), and
 * ort's wasmPaths mjs needs an absolute address.
 *
 * ORT_ASSET_REV is written by scripts/sync-ort.sh from onnxruntime-web/package.json,
 * don't hand-edit; at runtime person-matte prefers ort.env.versions.web (the real
 * version) — if the constant drifts the fallback URL may need another fetch, correctness
 * is unaffected.
 */
export const ORT_ASSET_REV = '1.27.0';

/** MODNet model's own revision (independent of ort version, rarely changes; +1 when replacing the model file). */
export const MODNET_REV = '1';

let matteBase = '';

/** Shell injects the CDN base (e.g. https://cdn.pireel.com/static); not called = same-origin serving. */
export function setMatteAssetBase(base: string): void {
  matteBase = base.replace(/\/+$/, '');
}

const base = () => matteBase || (typeof location !== 'undefined' ? location.origin : '');

export const modnetUrl = () => `${base()}/models/modnet_portrait.onnx?v=${MODNET_REV}`;

/** DeepFilterNet3 (strong narration denoise): the official ONNX export split into its three graphs.
 *  Bump when the files change (+1 like MODNET_REV). */
export const DFN3_MODEL_REV = '1';
export const dfn3ModelUrls = () => ({
  enc: `${base()}/models/dfn3/enc.onnx?v=${DFN3_MODEL_REV}`,
  erbDec: `${base()}/models/dfn3/erb_dec.onnx?v=${DFN3_MODEL_REV}`,
  dfDec: `${base()}/models/dfn3/df_dec.onnx?v=${DFN3_MODEL_REV}`,
});

/** jsep build pair (WebGPU EP; wasm EP fallback uses the same files). Pass the runtime's real version as rev. */
export const ortWasmUrls = (rev: string = ORT_ASSET_REV) => ({
  wasm: `${base()}/ort/ort-wasm-simd-threaded.jsep.wasm?v=${rev}`,
  mjs: `${base()}/ort/ort-wasm-simd-threaded.jsep.mjs?v=${rev}`,
});
