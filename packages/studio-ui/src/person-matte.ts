'use client';

/**
 * 人像 matting(MODNet on WebGPU)—— 抠像管线的高质量 mask 来源。
 * MediaPipe selfie 分割内部是 256 网格,放大到画布是台阶锯齿;matting 模型输出真
 * alpha matte(发丝级软边),这正是主流剪辑器级边缘的来源。
 *
 * WebGPU 专属:wasm 单线程一帧几百 ms 撑不起实时预览;WebGPU 不可用/加载失败一律返回
 * null,调用方(geometry.segmentPersonMask)退回 MediaPipe。运行时与模型全自托管:
 * public/ort/(scripts/sync-ort.sh)+ public/models/modnet_portrait.onnx
 * (来源 https://huggingface.co/Xenova/modnet)。
 */

import type * as OrtNs from 'onnxruntime-web';
import { modnetUrl, ortWasmUrls } from './matte-assets';

interface MatteSession {
  ort: typeof OrtNs;
  session: OrtNs.InferenceSession;
}

let _sess: Promise<MatteSession | null> | null = null;
// GPU 会话串行喂(mask 流本身逐帧;双缓冲并发一律排队)
let _queue: Promise<unknown> = Promise.resolve();

function load(): Promise<MatteSession | null> {
  if (_sess) return _sess;
  const p = (async () => {
    if (!('gpu' in navigator)) return null;
    try {
      const ort = await import('onnxruntime-web');
      // ?v= 缓存戳用 ort 运行时真实版本——immutable 一年缓存靠 URL 变化失效,升级即重拉;
      // URL 已是绝对地址(matte-assets 统一拼 base:CDN 直出或同源)
      const u = ortWasmUrls(ort.env.versions?.web);
      ort.env.wasm.wasmPaths = { wasm: u.wasm, mjs: u.mjs };
      // 模型选型:MODNet(人像 matting,纯标准算子,webgpu EP 全跑通)。RVM 更稳(时序记忆)
      // 但其 AveragePool(ceil_mode)在 ort-web webgpu 没实现、混合分派也救不回(算子被
      // webgpu 认领后运行期才炸)——等 EP 补上可切回(模型:PeterL1n/RobustVideoMatting releases)。
      const session = await ort.InferenceSession.create(modnetUrl(), {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      });
      console.info('[studio/person-matte] MODNet 就绪(WebGPU)');
      return { ort, session };
    } catch (e) {
      console.warn('[studio/person-matte] matting 模型加载失败,退回 MediaPipe 分割', e);
      return null;
    }
  })();
  _sess = p;
  // 失败不永久缓存:下次调用重试(网络抖动别把整个会话钉死在低质量路径)
  p.then(
    (s) => {
      if (!s && _sess === p) _sess = null;
    },
    () => {
      if (_sess === p) _sess = null;
    },
  );
  return p;
}

/**
 * 一帧位图 → alpha matte 位图(尺寸=推理分辨率,调用方按 cover 映射拉伸)。
 * 不负责 close 传入位图。WebGPU 不可用/失败返回 null。
 */
export function matteMask(src: ImageBitmap): Promise<ImageBitmap | null> {
  const run = async (): Promise<ImageBitmap | null> => {
    const s = await load();
    if (!s) return null;
    try {
      // MODNet:长边 ≤512,宽高取 32 的倍数(模型多级 /32 下采样,非整除会形变/报错);
      // 归一化 (x-0.5)/0.5;输出 [1,1,h,w] alpha
      const k = Math.min(1, 512 / Math.max(src.width, src.height));
      const w = Math.max(32, Math.round((src.width * k) / 32) * 32);
      const h = Math.max(32, Math.round((src.height * k) / 32) * 32);
      const oc = new OffscreenCanvas(w, h);
      const octx = oc.getContext('2d', { willReadFrequently: true });
      if (!octx) return null;
      octx.drawImage(src, 0, 0, w, h);
      const rgba = octx.getImageData(0, 0, w, h).data;
      const n = w * h;
      const chw = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        chw[i] = (rgba[i * 4]! / 255 - 0.5) / 0.5;
        chw[n + i] = (rgba[i * 4 + 1]! / 255 - 0.5) / 0.5;
        chw[2 * n + i] = (rgba[i * 4 + 2]! / 255 - 0.5) / 0.5;
      }
      const input = new s.ort.Tensor('float32', chw, [1, 3, h, w]);
      const out = await s.session.run({ [s.session.inputNames[0]!]: input });
      const pha = (await out[s.session.outputNames[0]!]!.getData()) as Float32Array;
      const px = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) px[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(pha[i]! * 255)));
      const mc = new OffscreenCanvas(w, h);
      const mctx = mc.getContext('2d');
      if (!mctx) return null;
      mctx.putImageData(new ImageData(px, w, h), 0, 0);
      return mc.transferToImageBitmap();
    } catch (e) {
      console.warn('[studio/person-matte] matting 推理失败', e);
      return null;
    }
  };
  const p = _queue.then(run, run);
  _queue = p.catch(() => {});
  return p;
}

export interface MatteFrame {
  /** 源时间(播放口径,已减首包偏移;= 预览里 video 的原生 currentTime)。 */
  t: number;
  /** alpha mask 的 webp(带透明通道):按需 createImageBitmap 解码,内存里只存压缩体。 */
  blob: Blob;
}

export const MATTE_FPS = 15;

/**
 * 预算一段 mask 轨:对 [from,to)(源时间,缺省=整条)按 MATTE_FPS 抽帧 → matting → webp mask 序列。
 * 按分镜段调用(选中哪段算哪段,用户定的:不做全量);预览端按时间取最近的 mask,不做实时推理。
 * 返回 null = 无视频轨/被取消。mask 按**源时间**索引,剪辑/裁切不影响缓存有效性。
 */
export async function computeMatteTrack(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  range?: { from: number; to: number },
): Promise<MatteFrame[] | null> {
  const { segmentPersonMask } = await import('./geometry');
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const k = Math.min(1, 512 / Math.max(vw, vh));
    const cw = Math.max(2, Math.round(vw * k));
    const ch = Math.max(2, Math.round(vh * k));
    const canvas = new OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const from = Math.max(0, range?.from ?? 0);
    const to = Math.min(durationSec, range?.to ?? durationSec);
    const stamps: number[] = [];
    for (let t = from; t < to; t += 1 / MATTE_FPS) stamps.push(t);
    if (!stamps.length) stamps.push(from);
    // 时间基归零:请求加回首包偏移,回带减掉(mp4 首包非零详见 thumbnails.ts)
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: MatteFrame[] = [];
    let done = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (signal?.aborted) return null;
      if (!sample) {
        done += 1;
        continue;
      }
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      const frame = canvas.transferToImageBitmap();
      canvas.width = cw; // transfer 后画布归零,重设尺寸复活
      canvas.height = ch;
      const mask = await segmentPersonMask(frame); // 内部负责 close frame
      if (mask) {
        const mc = new OffscreenCanvas(mask.width, mask.height);
        const mctx = mc.getContext('2d');
        if (mctx) {
          mctx.drawImage(mask, 0, 0);
          const blob = await mc.convertToBlob({ type: 'image/webp', quality: 0.8 });
          out.push({ t, blob });
        }
        mask.close();
      }
      done += 1;
      onProgress?.(done, stamps.length);
    }
    return signal?.aborted ? null : out;
  } finally {
    await input.dispose();
  }
}
