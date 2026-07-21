'use client';

/**
 * 几何遍(免费,不耗 token)—— 用 MediaPipe 在浏览器里密集分割人物 + 检测人脸,
 * 算出每段画面的【安全区】具体坐标(归一 [0..1],原点左上,可直接 ×comp 尺寸 → block 定位)。
 *
 * 分工:这里只管几何(人在哪、哪里空);语义(主题/构图/内容)归 VLM(稀疏,见 visual.ts)。
 * 失败一律降级返回 null,主链路退回 VLM 的粗 safe,不崩。
 *
 * 安全区算法:
 *  - 每帧分割 → 人物占用降采样到粗网格;人脸框单独留(硬禁)。
 *  - 某时段安全区 = 段内各帧占用的【并集】(主体曾出现处全避开)→ 取补集。
 *  - 在补集网格上跑【最大空矩形】top-K,给出可放置的矩形({x,y,w,h} 归一)。
 */

// mediabunny / @mediapipe/tasks-vision 都是重库且只在「用户选了视频 + 跑画面分析」后才需要——
// 一律动态加载,别压进 /studio 首包。类型导入不进 bundle。
import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';
import { GRID_H, GRID_W, type FrameGeom, type NRect, type SafeZone, safeZoneForRange } from '@pireel/studio-engine/geometry-math';
import { t } from './i18n';

export type { NRect, FrameGeom, SafeZone } from '@pireel/studio-engine/geometry-math';
export { safeZoneForRange } from '@pireel/studio-engine/geometry-math';

const GEOM_FPS = 2;
const MAX_FRAMES = 420; // 短片 2fps;长片把这些帧摊到整段(约每 1.5s 一帧 @10min),给每段都留下几何
const SEG_THRESHOLD = 0.4;

// self-host:WASM + 模型放 public/mediapipe/(同域、国内可达、不依赖 Google/jsdelivr)。
// 升级 @mediapipe/tasks-vision 后重跑 scripts/sync-mediapipe.sh 重拷 wasm。
const WASM = '/mediapipe/wasm';
const SEG_MODEL = '/mediapipe/selfie_segmenter.tflite';
const FACE_MODEL = '/mediapipe/blaze_face_short_range.tflite';

interface MP {
  seg: ImageSegmenter;
  face: FaceDetector;
  delegate: 'GPU' | 'CPU';
}
let _mp: Promise<MP | null> | null = null;

// 诊断:几何遍最近一次状态(给 🧪 面板 + console 看,别再静默失败)
let _note: string | null = null; // null = 未运行(模块作用域禁 t(),缺省文案在 geomNote 使用点翻)
export function geomNote(): string {
  return _note ?? t('未运行');
}

function loadMP(): Promise<MP | null> {
  if (_mp) return _mp;
  const p = (async () => {
    const { FaceDetector, FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    // CPU(XNNPACK)优先:浏览器 WebGL GPU delegate 常「创建成功但推理返回空/垃圾」(人脸/分割同时哑),
    // 而这是 2fps×256px 的离线分析,CPU 完全够且是参考实现,最可靠。GPU 仅作 CPU 创建失败的兜底。
    for (const delegate of ['CPU', 'GPU'] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        const seg = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        const face = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: 'IMAGE',
        });
        console.info(`[studio/geometry] MediaPipe 就绪(${delegate})`);
        return { seg, face, delegate };
      } catch (e) {
        _note = t('MediaPipe({delegate}) 加载失败: {msg}', { delegate, msg: e instanceof Error ? e.message : String(e) });
        console.warn('[studio/geometry]', _note); // GPU 失败会自动再试 CPU
      }
    }
    return null;
  })();
  _mp = p;
  // 加载失败(resolve null / reject)不永久缓存——重置后下次调用重试,
  // 否则一次网络抖动就把整个会话的几何遍钉死成 null。
  p.then(
    (mp) => {
      if (!mp && _mp === p) _mp = null;
    },
    () => {
      if (_mp === p) _mp = null;
    },
  );
  return p;
}

/** 单帧推理:分割 → 人物占用网格 + 人脸框。两个入口(密集分析 / 实时单帧)共用。 */
function inferFrame(mp: MP, canvas: HTMLCanvasElement, cw: number, ch: number): { face: NRect | null; occ: Uint8Array } {
  const occ = new Uint8Array(GRID_W * GRID_H);
  try {
    const res = mp.seg.segment(canvas);
    // mask 是 WASM 侧内存,close 必须走 finally——中途抛异常也不能泄漏(密集遍逐帧调,漏一帧攒一帧)
    try {
      const conf = res.confidenceMasks?.[0];
      const cat = res.categoryMask;
      if (conf) {
        const arr = conf.getAsFloat32Array();
        const mw = conf.width;
        const mh = conf.height;
        for (let gy = 0; gy < GRID_H; gy++) {
          const py = Math.min(mh - 1, Math.floor(((gy + 0.5) / GRID_H) * mh));
          for (let gx = 0; gx < GRID_W; gx++) {
            const px = Math.min(mw - 1, Math.floor(((gx + 0.5) / GRID_W) * mw));
            if ((arr[py * mw + px] ?? 0) > SEG_THRESHOLD) occ[gy * GRID_W + gx] = 1;
          }
        }
      } else if (cat) {
        const arr = cat.getAsUint8Array();
        const mw = cat.width;
        const mh = cat.height;
        for (let gy = 0; gy < GRID_H; gy++) {
          const py = Math.min(mh - 1, Math.floor(((gy + 0.5) / GRID_H) * mh));
          for (let gx = 0; gx < GRID_W; gx++) {
            const px = Math.min(mw - 1, Math.floor(((gx + 0.5) / GRID_W) * mw));
            if ((arr[py * mw + px] ?? 0) > 0) occ[gy * GRID_W + gx] = 1;
          }
        }
      }
    } finally {
      res.confidenceMasks?.forEach((m) => m.close());
      res.categoryMask?.close();
    }
  } catch {
    /* 这帧分割失败 → 当全空 */
  }
  let face: NRect | null = null;
  try {
    const b = mp.face.detect(canvas).detections?.[0]?.boundingBox;
    if (b) face = { x: b.originX / cw, y: b.originY / ch, w: b.width / cw, h: b.height / ch };
  } catch {
    /* 没检到脸 */
  }
  return { face, occ };
}

/**
 * 实时人像 mask(「文字穿人」预览用):优先 RVM matting(WebGPU,发丝级软边 + 时序稳定),
 * WebGPU 不可用/失败退回 selfie 分割(256 网格,低质量兜底;0.2–0.8 置信区间宽过渡,
 * 保住模型自身的软边不被二次硬化)。失败/未就绪返回 null,调用方跳过这帧。
 * 无论成败都负责 close 传入的 bitmap(它是 postMessage 转移来的,不还回去)。
 */
export async function segmentPersonMask(src: ImageBitmap): Promise<ImageBitmap | null> {
  try {
    const { matteMask } = await import('./person-matte');
    const matte = await matteMask(src);
    if (matte) return matte;
    const mp = await loadMP();
    if (!mp) return null;
    const res = mp.seg.segment(src);
    try {
      const conf = res.confidenceMasks?.[0];
      if (!conf) return null;
      const arr = conf.getAsFloat32Array();
      const mw = conf.width;
      const mh = conf.height;
      const px = new Uint8ClampedArray(mw * mh * 4);
      for (let i = 0; i < mw * mh; i++) {
        const c = arr[i] ?? 0;
        px[i * 4 + 3] = c <= 0.2 ? 0 : c >= 0.8 ? 255 : Math.round(((c - 0.2) / 0.6) * 255);
      }
      const oc = new OffscreenCanvas(mw, mh);
      const ctx = oc.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new ImageData(px, mw, mh), 0, 0);
      return oc.transferToImageBitmap();
    } finally {
      res.confidenceMasks?.forEach((m) => m.close());
      res.categoryMask?.close();
    }
  } catch {
    return null;
  } finally {
    try {
      src.close();
    } catch {
      /* ignore */
    }
  }
}

/** 密集分割每帧 → 人物占用网格 + 人脸框。失败返回 null。 */
export async function analyzeGeometry(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<FrameGeom[] | null> {
  const mp = await loadMP();
  if (!mp) return null; // _note 已记录加载失败原因

  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      _note = t('无视频轨,几何跳过');
      return null;
    }
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh)); // 推理输入压到长边 ≤256
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 跨整片均匀采样:短片用 GEOM_FPS;长片把 MAX_FRAMES 帧摊到整段
    // (否则只覆盖前 MAX_FRAMES/GEOM_FPS 秒 = 90s,后面的段全没几何、吃同一份兜底)。
    const stamps: number[] = [];
    const step = Math.max(1 / GEOM_FPS, durationSec / MAX_FRAMES);
    for (let t = 0; t < durationSec && stamps.length < MAX_FRAMES; t += step) stamps.push(t);

    // 时间基归零:stamps 是播放口径(durationSec 已归零),请求加回原始偏移、
    // 回带时间减掉(首包非零的 mp4 详见 thumbnails.ts)
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: FrameGeom[] = [];
    const total = stamps.length;
    let done = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();

      out.push({ t, ...inferFrame(mp, canvas, cw, ch) });
      done += 1;
      onProgress?.(done, total);
    }
    const withSubject = out.filter((f) => f.occ.some((v) => v)).length;
    const faceHits = out.filter((f) => f.face).length;
    // 平均人物占用率(粗判分割是否真在工作:口播一般 15~60%;≈0 = 分割没抓到人,极高 = 可能极性反了)
    const avgOcc = out.length ? Math.round((out.reduce((s, f) => s + f.occ.reduce((a, v) => a + v, 0), 0) / out.length / (GRID_W * GRID_H)) * 100) : 0;
    _note = t('已分析 {n} 帧({delegate}) · 人 {subject}帧/占{occ}% · 脸 {face}帧', { n: out.length, delegate: mp.delegate, subject: withSubject, occ: avgOcc, face: faceHits });
    return out;
  } catch (e) {
    _note = t('几何遍异常: {msg}', { msg: e instanceof Error ? e.message : String(e) });
    console.warn('[studio/geometry]', _note);
    return null;
  } finally {
    await input.dispose();
  }
}

/**
 * 区间几何(插入片段用):在源时间 [start,end] 内均匀抽 frames 帧(帧取每格中点,
 * 避开贴切点的转场糊帧)跑分割+人脸。只抽几帧,快;不进 _note 诊断(那是主源遍的)。
 * MediaPipe 不可用/无视频轨/一帧都没解出 → null,调用方退兜底。
 */
export async function analyzeGeometryRange(file: File, start: number, end: number, frames = 6): Promise<FrameGeom[] | null> {
  const mp = await loadMP();
  if (!mp) return null;
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh));
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const span = Math.max(0, end - start);
    const n = Math.max(1, Math.round(frames));
    const stamps = Array.from({ length: n }, (_, i) => Math.max(0, start) + (span * (i + 0.5)) / n);
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: FrameGeom[] = [];
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      out.push({ t, ...inferFrame(mp, canvas, cw, ch) });
    }
    return out.length ? out : null;
  } catch (e) {
    console.warn('[studio/geometry] 区间几何失败:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await input.dispose();
  }
}

/**
 * 实时单帧检测(调试用):抓时刻 t 那一帧,现算分割+人脸 → 该帧的安全区/脸/主体。
 * 给预览叠加层「拖到哪测哪帧」,比稀疏缓存准。每次开关 Input,适合 debounce 调用。
 */
export async function detectFrameAt(file: File, t: number): Promise<SafeZone | null> {
  const mp = await loadMP();
  if (!mp) return null;
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh));
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samplesAtTimestamps([Math.max(0, t) + t0])) {
      if (!sample) continue;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      const fg: FrameGeom = { t, ...inferFrame(mp, canvas, cw, ch) };
      return safeZoneForRange([fg], t, t);
    }
    return null;
  } catch {
    return null;
  } finally {
    await input.dispose();
  }
}
