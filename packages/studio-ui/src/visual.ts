'use client';

/**
 * Studio 画面分析 —— 读懂口播画面,**不发现分镜**,只产出两样:
 *  1) 源画面切点 cuts(口播本身若切到录屏/b-roll,这些点要接转场)——detectScenes,纯客户端不用模型。
 *  2) 每段画面理解 label(人在哪/安全区/已有内容/已烧字)——单张帧 → VLM(OpenRouter)。
 * 给"自动分镜"提供硬切点,给"怎么演"提供安全区/内容约束。单张喂(先不拼网格)。
 */

import { detectScenes } from '@pireel/studio-engine/video-edit/scene-detection';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import { type NRect, type SafeZone, analyzeGeometry, analyzeGeometryRange, geomNote, safeZoneForRange } from './geometry';
import { type DerivedPalette, extractPalette } from './palette';
import { fileSig } from './media';

// 数据契约归引擎包(分析实现留这里):layoutFromPlan 等吃这些形状
export type { VisualLabel, VisualSegment, VisualTimeline } from '@pireel/studio-engine/visual-types';
import type { VisualLabel, VisualSegment, VisualTimeline } from '@pireel/studio-engine/visual-types';

const MAX_VLM = 8; // VLM(付费)成本上限:段**不砍**,只采这么多点发 VLM,其余段语义就近继承
const CAPTION_RESERVE = 0.16; // 固定预留底部 16% 给字幕(不检测原片字幕:前面常没字、后期会加到底部)
const DEFAULT_LABEL: VisualLabel = { content: 'talkinghead', person: 'center', safe: 'full', hasText: false, desc: '' };

/* ---------- 画面分析缓存(localStorage,按文件指纹;同片不重跑 VLM) ---------- */
// v3:段不再砍(全片覆盖无空洞)+ 取景方向由密集几何定;换前缀让旧的 8 段缓存失效。
const VPREFIX = 'pinshot:studio:visual:v3:';
export function getCachedVisual(sig: string): VisualTimeline | null {
  if (!sig || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VPREFIX + sig);
    return raw ? (JSON.parse(raw) as VisualTimeline) : null;
  } catch {
    return null;
  }
}
function setCachedVisual(sig: string, v: VisualTimeline): void {
  if (!sig || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(VPREFIX + sig, JSON.stringify(v));
  } catch {
    /* 配额满/隐私模式:静默 */
  }
}

/** 清画面分析缓存:给 sig 清单条,否则清全部(调试时强制重跑用)。 */
export function clearVisualCache(sig?: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (sig) {
      localStorage.removeItem(VPREFIX + sig);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(VPREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* 静默 */
  }
}

async function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return { base64: btoa(bin), mime: blob.type || 'image/jpeg' };
}

/** 切点 → 段(过滤抖动切点、丢掉过短段)。 */
function segmentsFromCuts(cuts: number[], durationSec: number): { start: number; end: number }[] {
  const inner = cuts.filter((t) => t > 0.3 && t < durationSec - 0.1).sort((a, b) => a - b);
  const bounds = [0, ...inner, durationSec];
  const segs: { start: number; end: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    if (end - start > 0.4) segs.push({ start, end });
  }
  return segs.length ? segs : [{ start: 0, end: durationSec }];
}

/** 段太多 → 均匀挑 max 段(保住边界分布)。只用来挑「发 VLM 的采样点」,不砍段本身。 */
function capSegments<T>(segs: T[], max: number): T[] {
  if (segs.length <= max) return segs;
  const step = segs.length / max;
  return Array.from({ length: max }, (_, i) => segs[Math.floor(i * step)]!);
}

/** 人物 bbox → 在画面哪侧(给取景方向)。null/极小占用 = none(没人/纯画面)。 */
function personFromSubject(subject: NRect | null): VisualLabel['person'] {
  if (!subject || subject.w * subject.h < 0.02) return 'none';
  const cx = subject.x + subject.w / 2;
  return cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'center';
}

/* ---------- 插入片段几何(只跑 MediaPipe 几何遍,免费;**不走 VLM**,不给插入段烧钱) ---------- */

/** 会话级缓存:fileSig+区间 → 安全区。失败也缓存 null——一段插入源分析挂了,
 *  同会话内每次重分镜不必反复重跑(与 clipAsrFailRef 同一政策)。 */
const clipZoneCache = new Map<string, SafeZone | null>();

/** 插入片段 [srcStart,srcEnd] 的几何安全区:~6 帧均匀抽样跑 MediaPipe,聚合出区间
 *  rects(空矩形,从大到小)+ face,并扣掉底部字幕预留带(与主源同口径)。
 *  MediaPipe 不可用/抽帧失败 → null(缓存住),调用方退 FULL_GRAPHIC_BOX 兜底。 */
export async function insertedClipSafeZone(file: File, srcStart: number, srcEnd: number): Promise<SafeZone | null> {
  const key = `${fileSig(file)}:${srcStart.toFixed(1)}-${srcEnd.toFixed(1)}`;
  if (clipZoneCache.has(key)) return clipZoneCache.get(key) ?? null;
  let zone: SafeZone | null = null;
  try {
    const frames = await analyzeGeometryRange(file, srcStart, srcEnd, 6);
    if (frames?.length) {
      zone = safeZoneForRange(frames, srcStart, srcEnd, [{ x: 0, y: 1 - CAPTION_RESERVE, w: 1, h: CAPTION_RESERVE }]);
    }
  } catch {
    zone = null;
  }
  clipZoneCache.set(key, zone);
  return zone;
}

/** 语义遍之外的全部准备(切点/抽帧/几何/底色,全免费)——托管路(VLM)与 BYO 路
 *  (visual_brief:帧直接给外部 agent 自己看)共用同一份,标签装配走 finishVisualAnalysis。 */
export interface VisualPrep {
  sig: string;
  durationSec: number;
  cuts: number[];
  segsAll: { start: number; end: number }[];
  /** VLM 采样帧(base64,timestamp=实际抽到的时刻;extractThumbnails 会静默跳过解不出的点)。 */
  frames: { timestamp: number; base64: string; mime: string }[];
  geomFrames: Awaited<ReturnType<typeof analyzeGeometry>> | null;
  palette: DerivedPalette | null;
}

export async function prepareVisualAnalysis(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ cached: VisualTimeline } | { prep: VisualPrep }> {
  const sig = fileSig(file);
  const cached = getCachedVisual(sig);
  if (cached) {
    onProgress?.(1, 1); // 命中缓存:直接报完成
    return { cached };
  }

  const cutObjs = await detectScenes(file).catch(() => []);
  const cuts = cutObjs.map((c) => c.timestamp).filter((t) => t > 0.3 && t < durationSec - 0.1);

  const segsAll = segmentsFromCuts(cuts, durationSec); // 全部段,覆盖全片(不砍 → 无空洞)
  const vlmSegs = capSegments(segsAll, MAX_VLM); // 只挑这些点做语义采样;其余段语义就近继承

  const stamps = vlmSegs.map((s) => Math.min(s.end - 0.05, s.start + (s.end - s.start) / 2));
  const thumbs = await extractThumbnails(file, stamps, { width: 360 });
  const palettePromise = extractPalette(thumbs); // 复用同批缩略帧采样底色
  // 几何遍(MediaPipe 逐帧)是长 pole,进度以它为准
  const [geomFrames, palette] = await Promise.all([
    analyzeGeometry(file, durationSec, onProgress).catch(() => null),
    palettePromise,
  ]);
  const frames = await Promise.all(
    thumbs.map(async (th) => {
      const img = await blobToBase64(th.blob);
      return { timestamp: th.timestamp, base64: img.base64, mime: img.mime };
    }),
  );
  thumbs.forEach((th) => URL.revokeObjectURL(th.url));
  return { prep: { sig, durationSec, cuts, segsAll, frames, geomFrames, palette } };
}

/** 语义标签(labels[i] 与 prep.frames[i] 一一对应,null=该帧没拿到)→ 装配完整 VisualTimeline 并落缓存。 */
export function finishVisualAnalysis(prep: VisualPrep, labels: (VisualLabel | null)[]): VisualTimeline {
  const { cuts, segsAll, frames, geomFrames, palette } = prep;
  // 样本点(实际抽到的帧时刻 → 标签),给非采样段「就近继承」语义(content/hasText/desc)。
  // 用 frames 自带的 timestamp 对回时间点,而不是按下标对 vlmSegs(下标错位会把语义标签串段)。
  const vlmPts = frames.map((f, i) => ({ t: f.timestamp, label: labels[i] ?? DEFAULT_LABEL }));
  const nearestVlm = (t: number): VisualLabel => {
    let best = vlmPts[0]?.label ?? DEFAULT_LABEL;
    let bd = Infinity;
    for (const p of vlmPts) {
      const d = Math.abs(p.t - t);
      if (d < bd) {
        bd = d;
        best = p.label;
      }
    }
    return best;
  };

  // 预留字幕区:固定扣掉底部一条带当硬禁区(不检测原片字幕),落点永远避开,给后期加的字幕留位
  const textBands: NRect[] = [{ x: 0, y: 1 - CAPTION_RESERVE, w: 1, h: CAPTION_RESERVE }];

  // 全部段都建:几何(密集免费)逐段独立算 → 人位/取景方向全片都准;语义就近继承稀疏采样;
  // 底部预留带在每段都扣掉(硬禁区)
  const segments: VisualSegment[] = segsAll.map((s) => {
    const geom = geomFrames ? safeZoneForRange(geomFrames, s.start, s.end, textBands) : undefined;
    const base = nearestVlm((s.start + s.end) / 2);
    const person = geom ? personFromSubject(geom.subject) : base.person;
    const label: VisualLabel = { ...base, person };
    return { ...s, label, ...(geom ? { geom } : {}) };
  });
  const result: VisualTimeline = { cuts, segments, geomNote: geomNote(), ...(textBands.length ? { textBands } : {}), ...(palette ? { palette } : {}) };
  // 只缓存「至少有一遍成功」的结果:语义全挂 + 几何遍全失败 = 纯兜底数据,缓存了会把失败钉死
  // (下次打开同片直接命中,永远没机会重试)。部分成功可以缓存;想强制重测用 clearVisualCache。
  const vlmOk = labels.some((l) => l !== null);
  if (vlmOk || geomFrames) setCachedVisual(prep.sig, result);
  return result;
}

export async function analyzeVisual(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<VisualTimeline> {
  const r = await prepareVisualAnalysis(file, durationSec, onProgress);
  if ('cached' in r) return r.cached;
  // 托管语义遍:采样帧发自家 VLM(收费,BYO 路径没有这一步——agent 自己看帧)
  const labels = await Promise.all(
    r.prep.frames.map(async (f): Promise<VisualLabel | null> => {
      try {
        const resp = await fetch('/api/studio/vlm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image_base64: f.base64, mime: f.mime }),
        });
        if (!resp.ok) return null;
        return (await resp.json()) as VisualLabel;
      } catch {
        return null;
      }
    }),
  );
  return finishVisualAnalysis(r.prep, labels);
}
