/**
 * 转场窗口预烧录:切点/时长/效果都是确定的,离线把整个窗口合成好(MediaBunny 双侧
 * 采样 + 同一个 gl-transitions 合成器),播放时纯放帧——把"临场调度两个解码器"从
 * 关键路径上整个拿掉(用户点名的方向:已经是 canvas 了,提前烧录别现场调度)。
 *
 * 产物 = webp 帧序列(0.5× comp 分辨率、30fps;1s 转场 ≈ 30 帧 × ~80KB ≈ 2.4MB 内存),
 * 引擎逼近窗口时 decodeBake 解成 ImageBitmap,窗口过了即弃。烧录失败/没烧完 → 引擎
 * 自动落回影子解码路径,语义不变。
 *
 * 帧内容口径与预览 shim 完全一致:两侧源帧 cover 合成(不含取景/调色——那两样在
 * 预览里是 #vidEl 元素级的 CSS transform/filter,由 GSAP 关键帧照常作用在整块画布上)。
 */

import { type GlMixer, createGlMixer, glDirection } from '@pireel/studio-engine/transition-gl';
import type { CutTransitionEffect, TransitionDirection } from '@pireel/studio-engine/composition';
import { type SourceRig, openSource, sampleAt } from './client-export';

export interface BakeSpec {
  /** 成片切点(秒)与半宽。 */
  cut: number;
  half: number;
  effect: CutTransitionEffect;
  dir: TransitionDirection;
  /** 两侧源文件与切点处的源时间(A 在 aEnd 结束,B 从 bStart 开始)。 */
  fileA: File;
  aEnd: number;
  fileB: File;
  bStart: number;
  /** 画布(comp)尺寸——烧录按 0.5× 出。 */
  compW: number;
  compH: number;
}

export interface BakedWindow {
  cut: number;
  half: number;
  fps: number;
  w: number;
  h: number;
  frames: Blob[];
}

/** 帧数预算:短窗口烧高帧率(1s 窗口≈48fps),长窗口降帧控内存;夹在 24–60。 */
const FRAME_BUDGET = 96;

/** 烧一个转场窗口。cancelled() 轮询取消(编辑期重烧频繁,旧任务立即让路)。 */
export async function bakeTransitionWindow(spec: BakeSpec, cancelled?: () => boolean): Promise<BakedWindow | null> {
  const W = Math.max(2, Math.round(spec.compW / 2));
  const H = Math.max(2, Math.round(spec.compH / 2));
  const mixer: GlMixer | null = createGlMixer(W, H);
  if (!mixer) return null;
  const fps = Math.max(24, Math.min(60, FRAME_BUDGET / (2 * spec.half)));
  const n = Math.max(2, Math.round(2 * spec.half * fps));
  // 每侧两条顺序采样流(live 侧 + handle 侧;sampleAt 每流单调,时间域不衔接必须分流)
  const rigs: SourceRig[] = [];
  const open = async (f: File, from: number, to: number) => {
    const r = await openSource(f, Math.max(0, from), Math.max(0, to), W, H);
    rigs.push(r);
    return r;
  };
  const stageF = new OffscreenCanvas(W, H);
  const stageT = new OffscreenCanvas(W, H);
  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d')!;
  try {
    const liveA = await open(spec.fileA, spec.aEnd - spec.half, spec.aEnd);
    const ghostB = await open(spec.fileB, spec.bStart - spec.half, spec.bStart);
    const ghostA = await open(spec.fileA, spec.aEnd, spec.aEnd + spec.half);
    const liveB = await open(spec.fileB, spec.bStart, spec.bStart + spec.half);
    const [dx, dy] = glDirection(spec.dir);
    const frames: Blob[] = [];
    // 各侧画进自己的 stage;采样越界(handle 不够长)沿用上一帧内容,别断烧
    let haveF = false;
    let haveT = false;
    const drawSide = async (rig: SourceRig, srcT: number, stage: OffscreenCanvas): Promise<boolean> => {
      const smp = await sampleAt(rig, srcT);
      if (!smp) return false;
      const g = stage.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      smp.draw(g, (W - rig.dw) / 2, (H - rig.dh) / 2, rig.dw, rig.dh);
      return true;
    };
    for (let i = 0; i < n; i++) {
      if (cancelled?.()) return null;
      const t = spec.cut - spec.half + (i / (n - 1)) * 2 * spec.half;
      const p = i / (n - 1);
      const pre = t < spec.cut;
      // from/to 与 shim 同口径:切点前 A live/B 前摇,切点后 A 尾巴/B live
      haveF = (pre ? await drawSide(liveA, spec.aEnd - (spec.cut - t), stageF) : await drawSide(ghostA, spec.aEnd + (t - spec.cut), stageF)) || haveF;
      haveT = (pre ? await drawSide(ghostB, spec.bStart - (spec.cut - t), stageT) : await drawSide(liveB, spec.bStart + (t - spec.cut), stageT)) || haveT;
      if (!haveF || !haveT) return null; // 首帧就采不到:这个窗口烧不了(素材边界)
      if (!mixer.render(stageF, stageT, spec.effect, p, dx, dy, `f${i}`, `t${i}`)) return null;
      octx.clearRect(0, 0, W, H);
      octx.drawImage(mixer.canvas, 0, 0);
      frames.push(await out.convertToBlob({ type: 'image/webp', quality: 0.82 }));
    }
    return { cut: spec.cut, half: spec.half, fps: (n - 1) / (2 * spec.half), w: W, h: H, frames };
  } catch {
    return null;
  } finally {
    for (const r of rigs) {
      r.cur?.close();
      r.pending?.close();
      void r.input.dispose();
    }
  }
}

/** webp 帧序列 → ImageBitmap 序列(引擎逼近窗口时调,窗口过了整组 close)。 */
export async function decodeBake(b: BakedWindow): Promise<ImageBitmap[]> {
  return Promise.all(b.frames.map((blob) => createImageBitmap(blob)));
}
