/**
 * 人像抠像重资产(ort wasm 27M + MODNet 26M)的 URL 单点——person-matte 实际加载与
 * studio-boot 预热必须逐字节同 URL,否则预热等于白拉一份。
 *
 * ?v= 是缓存戳:资产响应是 `immutable` 一年缓存,失效全靠 URL 变化——戳不变永远吃缓存,
 * 升级时戳变自动重拉,不存在"缓存住旧引擎配新加载器"的错配窗口。
 *
 * 伺服来源两档(setMatteAssetBase,壳层注入):
 *  - 缺省 = 同源 /ort /models(dev 的 public/ 实体文件;生产由 server.ts 代理 R2 兜底)。
 *    同源代理的响应是 Worker 现造的——**边缘不缓存**,浏览器缓存未命中就全量穿透,只配当兜底。
 *  - 注入 CDN base(Pireel 生产 = cdn.pireel.com/static)= R2 自定义域直出:边缘缓存生效、
 *    带 etag/断点续传、不占 Worker。ort 官方支持 wasmPaths 跨域(CORS 已在桶上放行)。
 *
 * 返回的一律是**绝对 URL**:纯路径会被 Vite dev 的 import 重写加 ?import 拦截(public 资产
 * 不许走模块管线),且 ort wasmPaths 的 mjs 需要绝对地址。
 *
 * ORT_ASSET_REV 由 scripts/sync-ort.sh 从 onnxruntime-web/package.json 写入,别手改;
 * person-matte 运行时优先用 ort.env.versions.web(真实版本)——常量漂了只浪费一次预热,
 * 不影响正确性。
 */
export const ORT_ASSET_REV = '1.27.0';

/** MODNet 模型自己的修订号(与 ort 版本无关,几乎不换;替换模型文件时 +1)。 */
export const MODNET_REV = '1';

let matteBase = '';

/** 壳层注入 CDN base(如 https://cdn.pireel.com/static);不调用 = 同源伺服。 */
export function setMatteAssetBase(base: string): void {
  matteBase = base.replace(/\/+$/, '');
}

const base = () => matteBase || (typeof location !== 'undefined' ? location.origin : '');

export const modnetUrl = () => `${base()}/models/modnet_portrait.onnx?v=${MODNET_REV}`;

/** jsep 构建双件(WebGPU EP;wasm EP 兜底同文件)。rev 传运行时真实版本。 */
export const ortWasmUrls = (rev: string = ORT_ASSET_REV) => ({
  wasm: `${base()}/ort/ort-wasm-simd-threaded.jsep.wasm?v=${rev}`,
  mjs: `${base()}/ort/ort-wasm-simd-threaded.jsep.mjs?v=${rev}`,
});
