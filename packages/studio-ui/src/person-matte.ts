'use client';

/**
 * Person matting (RVM, Robust Video Matting, mobilenetv3 on WebGPU) — the high-quality mask source for
 * the matte pipeline. RVM carries a memory from frame to frame, so a sequence keeps steady edges and
 * reads things held against the body the same way frame after frame. MediaPipe selfie segmentation is
 * a 256 grid internally (stair-step edges) and stays the fallback.
 *
 * WebGPU only: on the CPU it is far too slow for a shot. When WebGPU is unavailable or loading fails it
 * returns null and the caller (geometry.segmentPersonMask) falls back to MediaPipe. The runtime and the
 * models are self-hosted: public/ort/ (scripts/sync-ort.sh) + public/models/rvm/ (built from the
 * official release by scripts/build-rvm-models.py — fixed input sizes, which the WebGPU backend needs).
 */

import type * as OrtNs from 'onnxruntime-web';
import { ortWasmUrls, rvmUrl } from './matte-assets';

/** The two frozen models: one input size each, with the shapes of the memory they carry. */
export const RVM_SHAPES = {
  landscape: { width: 1280, height: 720, memory: [[1, 16, 144, 256], [1, 20, 72, 128], [1, 40, 36, 64], [1, 64, 18, 32]] },
  portrait: { width: 720, height: 1280, memory: [[1, 16, 256, 144], [1, 20, 128, 72], [1, 40, 64, 36], [1, 64, 32, 18]] },
} as const;
export type RvmOrientation = keyof typeof RVM_SHAPES;

/** Where a frame sits in its model's input: scaled to fit, centred, the rest left empty. */
export function rvmFit(width: number, height: number): { orientation: RvmOrientation; x: number; y: number; w: number; h: number } {
  const orientation: RvmOrientation = width >= height ? 'landscape' : 'portrait';
  const { width: W, height: H } = RVM_SHAPES[orientation];
  const scale = Math.min(W / Math.max(1, width), H / Math.max(1, height));
  const w = Math.max(1, Math.min(W, Math.round(width * scale))); const h = Math.max(1, Math.min(H, Math.round(height * scale)));
  return { orientation, x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h };
}

/** A stream's memory carries on to a frame shortly after its last one; a seek back or a jump starts afresh. */
export const continuesStream = (last: number | undefined, t: number | undefined) => last !== undefined && t !== undefined && t > last && t - last <= 0.5;

/** A sequence of frames of one video (a shot being matted, a picture-in-picture layer playing): frames
 *  of the same stream share RVM's memory. Without one, a frame is matted as a still. */
export interface MatteStream { id: string; t: number }

interface MatteSession { ort: typeof OrtNs; session: OrtNs.InferenceSession }

const sessions = new Map<RvmOrientation, Promise<MatteSession | null>>();
// Feed the GPU serially: frames of a stream must run in order, and concurrent runs only queue up.
let _queue: Promise<unknown> = Promise.resolve();
const streams = new Map<string, { orientation: RvmOrientation; t: number; memory: OrtNs.Tensor[] }>();
const MAX_STREAMS = 8;

function load(orientation: RvmOrientation): Promise<MatteSession | null> {
  const cached = sessions.get(orientation);
  if (cached) return cached;
  const p = (async () => {
    if (!('gpu' in navigator)) return null;
    try {
      const ort = await import('onnxruntime-web');
      // ?v= cache-buster uses ort's real runtime version — immutable one-year caching invalidates via
      // URL change, so an upgrade re-fetches. URLs are already absolute (matte-assets joins the base: CDN or same-origin)
      const u = ortWasmUrls(ort.env.versions?.web);
      ort.env.wasm.wasmPaths = { wasm: u.wasm, mjs: u.mjs };
      const { width, height } = RVM_SHAPES[orientation];
      const session = await ort.InferenceSession.create(rvmUrl(width, height), { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
      console.info(`[studio/person-matte] RVM ${width}x${height} ready (WebGPU)`);
      return { ort, session };
    } catch (e) {
      console.warn('[studio/person-matte] matting model failed to load, falling back to MediaPipe segmentation', e);
      return null;
    }
  })();
  sessions.set(orientation, p);
  // Don't cache failures permanently: retry on the next call (a network blip shouldn't pin the whole session to the low-quality path)
  p.then((s) => { if (!s && sessions.get(orientation) === p) sessions.delete(orientation); }, () => { if (sessions.get(orientation) === p) sessions.delete(orientation); });
  return p;
}

/** Forget a stream's memory once its sequence is done. */
export function endMatteStream(id: string): void {
  streams.delete(id);
}

/**
 * One frame bitmap → alpha matte bitmap of the frame's shape (caller stretches it over the frame).
 * Frames of a `stream` share RVM's memory when they follow each other closely; a still (no stream) is
 * run three times so the memory settles on it. Does not close the passed-in bitmap. Returns null when
 * WebGPU is unavailable or the run fails.
 */
export function matteMask(src: ImageBitmap, stream?: MatteStream): Promise<ImageBitmap | null> {
  const run = async (): Promise<ImageBitmap | null> => {
    const fit = rvmFit(src.width, src.height);
    const s = await load(fit.orientation);
    if (!s) return null;
    const { ort, session } = s;
    const { width: W, height: H, memory: shapes } = RVM_SHAPES[fit.orientation];
    try {
      const oc = new OffscreenCanvas(W, H);
      const octx = oc.getContext('2d', { willReadFrequently: true });
      if (!octx) return null;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(src, fit.x, fit.y, fit.w, fit.h);
      const rgba = octx.getImageData(0, 0, W, H).data;
      const n = W * H;
      const chw = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        chw[i] = rgba[i * 4]! / 255;
        chw[n + i] = rgba[i * 4 + 1]! / 255;
        chw[2 * n + i] = rgba[i * 4 + 2]! / 255;
      }
      const prior = stream ? streams.get(stream.id) : undefined;
      let memory = prior && prior.orientation === fit.orientation && continuesStream(prior.t, stream?.t) ? prior.memory
        : shapes.map(dims => new ort.Tensor('float32', new Float32Array(dims.reduce<number>((a, b) => a * b, 1)), [...dims]));
      let pha: Float32Array | undefined;
      for (let pass = 0; pass < (stream ? 1 : 3); pass++) {
        const input = new ort.Tensor('float32', chw, [1, 3, H, W]);
        let outputs: Record<string, OrtNs.Tensor> | undefined;
        try {
          outputs = await session.run({ src: input, r1i: memory[0]!, r2i: memory[1]!, r3i: memory[2]!, r4i: memory[3]! });
          pha = (await outputs.pha!.getData()) as Float32Array;
          memory = await Promise.all(['r1o', 'r2o', 'r3o', 'r4o'].map(async name => new ort.Tensor('float32', (await outputs![name]!.getData()) as Float32Array, outputs![name]!.dims)));
        } finally {
          input.dispose();
          for (const tensor of Object.values(outputs ?? {})) tensor.dispose();
        }
      }
      if (stream) {
        streams.delete(stream.id);
        streams.set(stream.id, { orientation: fit.orientation, t: stream.t, memory });
        while (streams.size > MAX_STREAMS) streams.delete(streams.keys().next().value!);
      }
      // The matte of the frame's own region, as the alpha of a mask the size of that region.
      const pixels = new Uint8ClampedArray(fit.w * fit.h * 4);
      for (let y = 0; y < fit.h; y++) for (let x = 0; x < fit.w; x++) {
        const a = pha![(y + fit.y) * W + x + fit.x]!;
        pixels[(y * fit.w + x) * 4 + 3] = Math.round((Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0) * 255);
      }
      const mc = new OffscreenCanvas(fit.w, fit.h);
      const mctx = mc.getContext('2d');
      if (!mctx) return null;
      mctx.putImageData(new ImageData(pixels, fit.w, fit.h), 0, 0);
      return mc.transferToImageBitmap();
    } catch (e) {
      if (stream) streams.delete(stream.id);
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
    const k = Math.min(1, 1280 / Math.max(vw, vh));
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
    // RVM's memory settles over the first frames: a second before the range is matted and dropped.
    const warm: number[] = [];
    for (let t = Math.max(0, from - 1); t < from - 1e-6; t += 1 / MATTE_FPS) warm.push(t);
    const stream = `track:${crypto.randomUUID()}`;
    // Time base zeroing: add the first-packet offset back on request, subtract it on return (mp4 non-zero first packet — see thumbnails.ts)
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: MatteFrame[] = [];
    let done = 0;
    let index = 0;
    try {
      for await (const sample of sink.samplesAtTimestamps([...warm, ...stamps].map((s) => s + t0))) {
        if (signal?.aborted) return null;
        const warming = index++ < warm.length;
        if (!sample) {
          if (!warming) { done += 1; onProgress?.(done, stamps.length); }
          continue;
        }
        const t = sample.timestamp - t0;
        sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
        sample.close();
        const frame = canvas.transferToImageBitmap();
        canvas.width = cw; // canvas is zeroed after transfer; resetting the size revives it
        canvas.height = ch;
        const mask = await segmentPersonMask(frame, { id: stream, t }); // closes frame internally
        if (mask && !warming) {
          const mc = new OffscreenCanvas(mask.width, mask.height);
          const mctx = mc.getContext('2d');
          if (mctx) {
            mctx.drawImage(mask, 0, 0);
            const blob = await mc.convertToBlob({ type: 'image/webp', quality: 0.8 });
            out.push({ t, blob });
          }
        }
        mask?.close();
        if (!warming) { done += 1; onProgress?.(done, stamps.length); }
      }
    } finally {
      endMatteStream(stream);
    }
    return signal?.aborted ? null : out;
  } finally {
    await input.dispose();
  }
}
