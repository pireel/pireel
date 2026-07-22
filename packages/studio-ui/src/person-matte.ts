'use client';

/**
 * Person matting (MODNet on WebGPU) — the high-quality mask source for the matte pipeline.
 * MediaPipe selfie segmentation is a 256 grid internally, so upscaling to the canvas gives stair-step
 * aliasing; the matting model outputs a true alpha matte (hair-level soft edges) — the source of
 * commercial-grade edges.
 *
 * WebGPU only: wasm single-threaded takes hundreds of ms per frame, too slow for live preview. When
 * WebGPU is unavailable / load fails, always return null and the caller (geometry.segmentPersonMask)
 * falls back to MediaPipe. Runtime and model are fully self-hosted: public/ort/ (scripts/sync-ort.sh)
 * + public/models/modnet_portrait.onnx (from https://huggingface.co/Xenova/modnet).
 */

import type * as OrtNs from 'onnxruntime-web';
import { modnetUrl, ortWasmUrls } from './matte-assets';

interface MatteSession {
  ort: typeof OrtNs;
  session: OrtNs.InferenceSession;
}

let _sess: Promise<MatteSession | null> | null = null;
// Feed the GPU session serially (the mask stream is frame-by-frame; double-buffered concurrency queues up)
let _queue: Promise<unknown> = Promise.resolve();

function load(): Promise<MatteSession | null> {
  if (_sess) return _sess;
  const p = (async () => {
    if (!('gpu' in navigator)) return null;
    try {
      const ort = await import('onnxruntime-web');
      // ?v= cache-buster uses ort's real runtime version — immutable one-year caching invalidates via
      // URL change, so an upgrade re-fetches. URLs are already absolute (matte-assets joins the base: CDN or same-origin)
      const u = ortWasmUrls(ort.env.versions?.web);
      ort.env.wasm.wasmPaths = { wasm: u.wasm, mjs: u.mjs };
      // Model choice: MODNet (person matting, standard ops only, runs fully on the webgpu EP). RVM is
      // steadier (temporal memory) but its AveragePool (ceil_mode) isn't implemented in ort-web webgpu,
      // and hybrid dispatch can't save it either (once webgpu claims the op it blows up at runtime) —
      // switch back once the EP fills it in (model: PeterL1n/RobustVideoMatting releases).
      const session = await ort.InferenceSession.create(modnetUrl(), {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      });
      console.info('[studio/person-matte] MODNet ready (WebGPU)');
      return { ort, session };
    } catch (e) {
      console.warn('[studio/person-matte] matting model failed to load, falling back to MediaPipe segmentation', e);
      return null;
    }
  })();
  _sess = p;
  // Don't cache failures permanently: retry on the next call (a network blip shouldn't pin the whole session to the low-quality path)
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
 * One frame bitmap → alpha matte bitmap (size = inference resolution; caller stretches via cover mapping).
 * Does not close the passed-in bitmap. Returns null when WebGPU is unavailable / fails.
 */
export function matteMask(src: ImageBitmap): Promise<ImageBitmap | null> {
  const run = async (): Promise<ImageBitmap | null> => {
    const s = await load();
    if (!s) return null;
    try {
      // MODNet: long edge ≤512, width/height rounded to multiples of 32 (the model down-samples by /32
      // multiple times; non-divisible sizes distort or error). Normalize (x-0.5)/0.5; output [1,1,h,w] alpha
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
      console.warn('[studio/person-matte] matting inference failed', e);
      return null;
    }
  };
  const p = _queue.then(run, run);
  _queue = p.catch(() => {});
  return p;
}

export interface MatteFrame {
  /** Source time (playback frame of reference, first-packet offset already subtracted; = the preview video's native currentTime). */
  t: number;
  /** webp of the alpha mask (with transparency): decoded via createImageBitmap on demand, only the compressed form kept in memory. */
  blob: Blob;
}

export const MATTE_FPS = 15;

/**
 * Precompute a mask track: over [from,to) (source time, default = whole clip), sample at MATTE_FPS →
 * matting → webp mask sequence. Called per shot (whichever segment the user selects; no full-clip pass);
 * the preview picks the nearest mask by time and does no live inference.
 * Returns null = no video track / cancelled. Masks are indexed by **source time**, so trim/cut don't invalidate the cache.
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
    // Time base zeroing: add the first-packet offset back on request, subtract it on return (mp4 non-zero first packet — see thumbnails.ts)
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
      canvas.width = cw; // canvas is zeroed after transfer; resetting the size revives it
      canvas.height = ch;
      const mask = await segmentPersonMask(frame); // closes frame internally
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
