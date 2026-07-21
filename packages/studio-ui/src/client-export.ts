/**
 * 客户端导出(本地合成,默认路径;服务端渲染只作兜底):
 *
 *  视频层(轨0,多源)—— 每个源(主视频 File / 插入段 File|URL)各一条 MediaBunny 顺序
 *    取样流,按成片时间逐帧取帧画进 canvas;取景变换不重算 —— 隐藏 iframe 里 GSAP/inline
 *    的 computed transform 逐帧照抄(与预览严格同源)。
 *  叠加层(轨≥1)—— 同一 iframe seekTimelines(t) 后把 #root 序列化进 SVG foreignObject
 *    → <img> → drawImage,光栅化引擎就是 Blink 本身。字体与块内图片必须内联成 data:
 *    (foreignObject 光栅化禁止一切外部加载);主轨 <video> 用 !important CSS 压隐
 *    (TRIM_SHIM 的 applyMode 每次定位都会改 inline opacity,inline 压不住它)。
 *  音轨 —— 按成片段序拼接:主段取主视频音轨,插入段取它自己的音轨(与预览口径一致),
 *    重打时间戳到成片时间轴。
 *
 *  已知不导出:画中画视频块的画面(video 元素进不了 foreignObject)、人像抠像层(canvas
 *    不参与序列化,预览外自然降级)。移植自 experiments/client-export-spike(坑与注均出自实测)。
 */

import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  VideoSampleSink,
  WebMOutputFormat,
  type VideoSample,
} from 'mediabunny';
import { type Composition, type ShotFilter, type TransitionDirection, assembleHtml, cutTransitions, shotFilterCss, totalDuration } from '@pireel/studio-engine/composition';
import { createGlMixer, glDirection } from '@pireel/studio-engine/transition-gl';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { injectPreviewRuntime } from './sample-composition';
import { buildInlineFontCss } from './export-fonts';
import { t } from './i18n';

/** 导出参数(弹窗选的):res=短边像素(竖屏即宽),fps 帧率,format 容器/编码。 */
export interface ExportRenderOpts {
  res: number;
  fps: number;
  format: 'mp4' | 'mov' | 'webm';
}
export const DEFAULT_RENDER_OPTS: ExportRenderOpts = { res: 1080, fps: 30, format: 'mp4' };

/* ============================ 源与段 ============================ */

interface ExpSeg {
  srcStart: number;
  srcEnd: number;
  /** 源键:'main' 或插入段源键(clip_<shotId>,只作 rigs/files 的 Map 键用)。 */
  key: string;
  /** 该镜的调色(CSS filter 串;'none'/缺省=不调)——与预览 #vidEl 的 filter 同一 shotFilterCss 口径。 */
  filter?: string;
}

export interface SourceRig {
  input: Input;
  video: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;
  audio: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>;
  /** 顺序取样(该源的取帧时刻单调递增):当前帧 + 单帧 lookahead。 */
  it: AsyncIterator<VideoSample> | null;
  cur: VideoSample | null;
  pending: VideoSample | null;
  dw: number;
  dh: number;
}

export async function openSource(file: File, from: number, to: number, W: number, H: number): Promise<SourceRig> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error(t('源缺视频轨'));
  const audio = await input.getPrimaryAudioTrack();
  const cover = Math.max(W / video.displayWidth, H / video.displayHeight);
  const sink = new VideoSampleSink(video);
  return {
    input,
    video,
    audio,
    it: sink.samples(from, to + 0.5)[Symbol.asyncIterator](),
    cur: null,
    pending: null,
    dw: video.displayWidth * cover,
    dh: video.displayHeight * cover,
  };
}

/** 顺序流取"时间戳 ≤ srcT 的最后一帧"(spike 同款:webm 无 cues 随机访问会大面积 null)。 */
export async function sampleAt(rig: SourceRig, srcT: number): Promise<VideoSample | null> {
  for (;;) {
    if (rig.pending) {
      if (rig.pending.timestamp <= srcT) {
        rig.cur?.close();
        rig.cur = rig.pending;
        rig.pending = null;
        continue;
      }
      break;
    }
    if (!rig.it) break;
    const { value, done } = await rig.it.next();
    if (done || !value) break;
    if (value.timestamp <= srcT) {
      rig.cur?.close();
      rig.cur = value;
    } else {
      rig.pending = value;
      break;
    }
  }
  return rig.cur;
}

/* ============================ 叠加层 ============================ */

interface HfWin extends Window {
  __hfPreview?: { seekTimelines(t: number): void };
}

interface Overlay {
  iframe: HTMLIFrameElement;
  win: HfWin;
  doc: Document;
  root: HTMLElement;
  headCss: string;
  dispose(): void;
}

function createOverlay(html: string, w: number, h: number): Promise<Overlay> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `position:absolute;left:-200vw;top:0;width:${w}px;height:${h}px;border:0;`;
    iframe.srcdoc = html;
    iframe.addEventListener('load', () => {
      void (async () => {
        try {
          const win = iframe.contentWindow as HfWin;
          const doc = iframe.contentDocument!;
          // 主轨视频交给 canvas 层画,DOM 里不参与光栅化(#vidEl 是画布,插入段没有独立元素)
          const hide = doc.createElement('style');
          hide.textContent = '#vidEl { opacity: 0 !important; }';
          doc.head.appendChild(hide);
          await doc.fonts.ready;
          const root = doc.getElementById('root');
          if (!root || !win.__hfPreview) throw new Error(t('overlay doc 缺 #root 或预览运行时'));
          const headCss = [...doc.head.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
          resolve({ iframe, win, doc, root, headCss, dispose: () => iframe.remove() });
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
    document.body.appendChild(iframe);
  });
}

/** 块内 <img> 全部内联成 data URI(foreignObject 光栅化禁止外部加载;跨域走 /api/media/fetch 代理)。 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (!src || src.startsWith('data:')) return;
      try {
        const sameOrigin = src.startsWith('/') || src.startsWith(location.origin);
        const url = sameOrigin ? src : `/api/media/fetch?url=${encodeURIComponent(src)}`;
        const blob = await (await fetch(url)).blob();
        const dataUri = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error('read failed'));
          fr.readAsDataURL(blob);
        });
        img.setAttribute('src', dataUri);
      } catch {
        /* 单图失败不挡导出:该图缺席 */
      }
    }),
  );
}

const XS = new XMLSerializer();

function svgOpen(lw: number, lh: number, dw: number, dh: number, css: string): string {
  // SVG 必须 data: URI(blob: 会把 canvas 判 tainted,spike 实测)。
  // 设备尺寸 dw×dh(可 > 布局尺寸)+ viewBox=布局坐标系:浏览器在目标分辨率**重新栅格化**
  // 矢量内容(4K 文字/图形清晰,而非把 1080 位图拉大)。dw==lw 时 viewBox 恒等,渲染与旧版一致。
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dw}" height="${dh}" viewBox="0 0 ${lw} ${lh}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${lw}px;height:${lh}px;position:relative;overflow:hidden;">` +
    `<style>${css}</style>`
  );
}
const SVG_CLOSE = `</div></foreignObject></svg>`;

async function rasterize(uri: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = uri;
  await img.decode();
  return img;
}

function readTransform(win: Window, el: Element | null): { m: DOMMatrix; radius: number } {
  if (!el) return { m: new DOMMatrix(), radius: 0 };
  const cs = win.getComputedStyle(el);
  const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
  return { m, radius: parseFloat(cs.borderTopLeftRadius) || 0 };
}

/* ============================ 导出主流程 ============================ */

export interface ClientExportOpts {
  comp: Composition;
  videoFile: File;
  /** 本地插入段 File(键=blob URL,与 workbench clipFilesRef 同源)。 */
  clipFiles: Map<string, File>;
  /** 分辨率/帧率/格式(缺省 1080p·30·MP4)。 */
  render?: ExportRenderOpts;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export class ExportCanceled extends Error {
  constructor() {
    super('export canceled');
  }
}

/** 单帧捕获(外部 agent 的 capture_frame 验证工具用):与导出同一条渲染管线的一帧——
 *  主题背景 + 源视频帧(带取景变换/圆角/投影)+ 叠加层 foreignObject 光栅化。
 *  返回降采样 JPEG dataURL(体积对 LLM 上下文友好);无视频时只画背景+叠加层。 */
export async function captureCompositionFrame(opts: {
  comp: Composition;
  videoFile: File | null;
  clipFiles: Map<string, File>;
  atSec: number;
  /** 输出长边像素(默认 960)。 */
  maxDim?: number;
}): Promise<{ dataUrl: string; width: number; height: number }> {
  const { comp } = opts;
  const W = comp.width;
  const H = comp.height;
  const k = Math.min(1, (opts.maxDim ?? 960) / Math.max(W, H));
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  const outW = even(W * k);
  const outH = even(H * k);
  const t = Math.max(0, Math.min(totalDuration(comp), opts.atSec));

  // 定位 t 落在哪个成片段(与导出的 segAt 同口径),只开那一个源
  let rig: SourceRig | null = null;
  let srcT = 0;
  if (opts.videoFile) {
    const shots = comp.shots?.length ? comp.shots : [{ id: 'all', srcStart: 0, srcEnd: comp.video?.durationSec ?? 0, treatment: 'full' as const }];
    let file: File | null = null;
    for (const sp of clipSpans(shots)) {
      if (t >= sp.editedStart - 1e-6 && t < sp.editedEnd + 1e-6) {
        const s = sp.clip as (typeof shots)[number] & { src?: string };
        srcT = Math.min(s.srcEnd, s.srcStart + (t - sp.editedStart));
        file = s.src ? (opts.clipFiles.get(s.src) ?? null) : opts.videoFile;
        break;
      }
    }
    if (file) {
      try {
        rig = await openSource(file, Math.max(0, srcT - 0.1), srcT, W, H);
      } catch {
        rig = null; // 源打不开:退化为无视频帧(叠加层仍然可见)
      }
    }
  }

  const overlay = await createOverlay(injectPreviewRuntime(assembleHtml(comp)), W, H);
  try {
    await inlineImages(overlay.root);
    const fontCss = await buildInlineFontCss(overlay.root.textContent ?? '');
    const css = `${fontCss}\n${overlay.headCss}\n#root{background:transparent !important;}`;
    overlay.win.__hfPreview!.seekTimelines(t);
    const el = overlay.doc.getElementById('vidEl');
    const vs = readTransform(overlay.win, el);
    const bg = await rasterize(
      'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(svgOpen(W, H, outW, outH, overlay.headCss) + `<div xmlns="http://www.w3.org/1999/xhtml" id="root"></div>` + SVG_CLOSE),
    );
    const overlayImg = await rasterize(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOpen(W, H, outW, outH, css) + XS.serializeToString(overlay.root) + SVG_CLOSE),
    );

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bg, 0, 0);
    const sample = rig ? await sampleAt(rig, srcT) : null;
    if (sample && rig) {
      const Sx = outW / W;
      const Sy = outH / H;
      ctx.setTransform(Sx, 0, 0, Sy, 0, 0);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.transform(vs.m.a, vs.m.b, vs.m.c, vs.m.d, vs.m.e, vs.m.f);
      ctx.translate(-W / 2, -H / 2);
      const path = new Path2D();
      path.roundRect(0, 0, W, H, vs.radius);
      ctx.clip(path);
      sample.draw(ctx, (W - rig.dw) / 2, (H - rig.dh) / 2, rig.dw, rig.dh);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.drawImage(overlayImg, 0, 0);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), width: outW, height: outH };
  } finally {
    if (rig) {
      rig.cur?.close();
      rig.pending?.close();
      void rig.input.dispose();
    }
    overlay.dispose();
  }
}

export async function clientExportVideo(opts: ClientExportOpts): Promise<Blob> {
  const { comp, videoFile, clipFiles } = opts;
  const render = opts.render ?? DEFAULT_RENDER_OPTS;
  const FPS = render.fps;
  const W = comp.width;
  const H = comp.height;
  // 输出尺寸:res=短边,只缩不放;布局/取景全部仍在 comp 坐标系算,画布端一个 setTransform 缩放。
  // 宽高各自取偶(编码器要求)→ Sx/Sy 各算各的,亚像素差不留黑边
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  // res=输出短边像素。放大到 4K 靠矢量层在目标分辨率重栅格化(svgOpen 的 viewBox)+ 源视频
  // drawImage 从原生帧直缩到输出(不经 1080 中转)。上限 4× 兜底,防画布/内存爆(下拉最高 2160=2×)。
  const k = Math.min(4, render.res / Math.min(W, H));
  const outW = even(W * k);
  const outH = even(H * k);
  const Sx = outW / W;
  const Sy = outH / H;
  const shots = comp.shots?.length ? comp.shots : [{ id: 'all', srcStart: 0, srcEnd: comp.video?.durationSec ?? 0, treatment: 'full' as const }];
  const durationSec = Math.max(0.5, totalDuration(comp));

  // 段表(成片序)+ 每个源的 File
  const segs: ExpSeg[] = [];
  const files = new Map<string, File>([['main', videoFile]]);
  for (const sp of clipSpans(shots)) {
    const s = sp.clip as (typeof shots)[number] & { src?: string; filter?: ShotFilter };
    const filterCss = shotFilterCss(s.filter);
    const filter = filterCss === 'none' ? {} : { filter: filterCss };
    if (!s.src) {
      segs.push({ srcStart: s.srcStart, srcEnd: s.srcEnd, key: 'main', ...filter });
      continue;
    }
    const key = `clip_${s.id}`;
    segs.push({ srcStart: s.srcStart, srcEnd: s.srcEnd, key, ...filter });
    if (!files.has(key)) {
      const local = clipFiles.get(s.src);
      if (local) files.set(key, local);
      else {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(s.src)}`);
        if (!r.ok) throw new Error(t('插入片段拉取失败'));
        files.set(key, new File([await r.blob()], 'clip.mp4', { type: 'video/mp4' }));
      }
    }
  }

  // 每源顺序取样流:起点=该源最早用到的时刻,终点=最晚
  const rigs = new Map<string, SourceRig>();
  for (const [key, file] of files) {
    const mine = segs.filter((s) => s.key === key);
    if (!mine.length) continue;
    const from = Math.min(...mine.map((s) => s.srcStart));
    const to = Math.max(...mine.map((s) => s.srcEnd));
    rigs.set(key, await openSource(file, from, to, W, H));
  }

  // 叠加层文档 + 资产内联
  const overlay = await createOverlay(injectPreviewRuntime(assembleHtml(comp)), W, H);
  try {
    await inlineImages(overlay.root);
    const fontCss = await buildInlineFontCss(overlay.root.textContent ?? '');
    const css = `${fontCss}\n${overlay.headCss}\n#root{background:transparent !important;}`;
    // 布局坐标系恒为 comp 的 W×H(字号标定不变);设备尺寸 = 输出 outW×outH → 矢量在 4K 直接清晰栅格化
    const preEnc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOpen(W, H, outW, outH, css));
    const postEnc = encodeURIComponent(SVG_CLOSE);
    // 主题背景位图(一次):空 root 走同一条光栅化管线(同样按输出分辨率栅格化)
    const bg = await rasterize(
      'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(svgOpen(W, H, outW, outH, overlay.headCss) + `<div xmlns="http://www.w3.org/1999/xhtml" id="root"></div>` + SVG_CLOSE),
    );

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    const outFormat = render.format === 'webm' ? new WebMOutputFormat() : render.format === 'mov' ? new MovOutputFormat() : new Mp4OutputFormat();
    const output = new Output({ format: outFormat, target: new BufferTarget() });
    const videoSource = new CanvasSource(canvas, { codec: render.format === 'webm' ? 'vp9' : 'avc', bitrate: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { frameRate: FPS });
    const anyAudio = [...rigs.values()].some((r) => r.audio);
    // webm 容器装不下 aac,音轨随格式换 opus
    const audioSource = anyAudio ? new AudioSampleSource({ codec: render.format === 'webm' ? 'opus' : 'aac', bitrate: QUALITY_MEDIUM }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // 成片时间 → 段 + 源内时刻(段外/片尾:冻在最后一段末帧)
    const segStarts: number[] = [];
    {
      let acc = 0;
      for (const s of segs) {
        segStarts.push(acc);
        acc += Math.max(0, s.srcEnd - s.srcStart);
      }
    }
    const videoTotal = segStarts.length ? segStarts[segStarts.length - 1]! + Math.max(0, segs.at(-1)!.srcEnd - segs.at(-1)!.srcStart) : 0;
    const segAt = (te: number): { seg: ExpSeg; srcT: number } => {
      const t = Math.max(0, Math.min(videoTotal, te));
      for (let i = segs.length - 1; i >= 0; i--) {
        if (t >= segStarts[i]! - 1e-6) {
          const s = segs[i]!;
          return { seg: s, srcT: Math.min(s.srcEnd, s.srcStart + (t - segStarts[i]!)) };
        }
      }
      return { seg: segs[0]!, srcT: segs[0]!.srcStart };
    };

    // 切点转场(真双流,与预览 videoFrameShim 同一套数学):当前帧画进 liveC,"另一侧"
    // (切点前=B 的前摇 handle,切点后=A 的尾巴 handle)由影子取样流画进 ghostC,再按
    // from/to 合成进 vidC,p 铺满整个窗口。影子取样越界/缺席=硬切降级。
    // 每个转场每侧单独开 Input:sampleAt 每流单调,窗口两侧时间域不衔接必须分流。
    const vidC = new OffscreenCanvas(outW, outH);
    const vctx = vidC.getContext('2d')!;
    const liveC = new OffscreenCanvas(outW, outH);
    const lctx = liveC.getContext('2d')!;
    const ghostC = new OffscreenCanvas(outW, outH);
    const gctx = ghostC.getContext('2d')!;
    const trsX: { cut: number; half: number; effect: string; dir: string; preKey: string; postKey: string; segA: ExpSeg; segB: ExpSeg }[] = [];
    for (const tr of cutTransitions(shots)) {
      let iB = -1;
      for (let bi = 1; bi < segs.length; bi++) {
        if (Math.abs(segStarts[bi]! - tr.cut) < 0.05) {
          iB = bi;
          break;
        }
      }
      if (iB < 1) continue;
      const segA = segs[iB - 1]!;
      const segB = segs[iB]!;
      const fA = files.get(segA.key);
      const fB = files.get(segB.key);
      if (!fA || !fB) continue;
      const preKey = `g_pre_${trsX.length}`;
      const postKey = `g_post_${trsX.length}`;
      rigs.set(preKey, await openSource(fB, Math.max(0, segB.srcStart - tr.half), segB.srcStart + 0.2, W, H));
      rigs.set(postKey, await openSource(fA, segA.srcEnd, segA.srcEnd + tr.half + 0.2, W, H));
      trsX.push({ cut: tr.cut, half: tr.half, effect: tr.effect, dir: tr.dir, preKey, postKey, segA, segB });
    }
    // gl-transitions 合成器(输出分辨率;无转场不建)
    const mixer = trsX.length ? createGlMixer(outW, outH) : null;

    // 每源视频流的最后使用时刻(成片时间):过点就收视频解码器 —— 长项目里转场影子流
    // ×2/插入段各占一个解码器,攒到几十个会挤爆硬解配额掉软解(取帧随时长变慢的来源)。
    // input 不能收(音轨阶段还要用),只收视频取样流;影子源整个是导出私有的,连 input 一起收。
    const lastUse = new Map<string, number>();
    for (let si = 0; si < segs.length; si++) {
      const end = segStarts[si]! + Math.max(0, segs[si]!.srcEnd - segs[si]!.srcStart);
      lastUse.set(segs[si]!.key, Math.max(lastUse.get(segs[si]!.key) ?? 0, end));
    }
    for (const x of trsX) {
      lastUse.set(x.preKey, x.cut + x.half);
      lastUse.set(x.postKey, x.cut + x.half);
    }
    const retireVideoStream = (rig: SourceRig) => {
      rig.cur?.close();
      rig.cur = null;
      rig.pending?.close();
      rig.pending = null;
      void rig.it?.return?.(undefined);
      rig.it = null;
    };

    // 叠加层序列化只收「当刻可见」的块:seekTimelines 已把窗外块打成 visibility:hidden,
    // 跳过它们后热帧 SVG 文档只含少数几个块 —— 解析/排版成本不再随项目总块数涨
    // (整 root 序列化时,11 分钟项目每个热帧都在重排全部几百个块)。
    const rootShell = XS.serializeToString(overlay.root.cloneNode(false));
    const rootOpen = rootShell.endsWith('/>') ? `${rootShell.slice(0, -2)}>` : rootShell.slice(0, rootShell.lastIndexOf('</'));
    const serializeVisible = (): string => {
      let s = rootOpen;
      for (const el of overlay.root.children) {
        if ((el as HTMLElement).style?.visibility === 'hidden') continue;
        s += XS.serializeToString(el);
      }
      return `${s}</div>`;
    };

    const total = Math.max(1, Math.round(durationSec * FPS));
    // 叠加层帧缓存:tween 间隙/字幕静止期序列化串逐帧相同 → 复用上一帧位图,
    // 跳过整条 data URI(含内联字体,MB 级)的解析与光栅化(导出耗时大头)。
    let lastSerial = '';
    let lastOverlayImg: HTMLImageElement | null = null;
    // 编码与下一帧准备重叠:CanvasSource.add 调用时同步抓帧,返回的 Promise 只是编码器
    // 背压 —— 抓完就能改画布,背压压到下一帧 add 之前才等。
    let pendingAdd: Promise<void> | null = null;
    // 分段计时(并行段各记各的墙钟,和可大于总墙钟):瓶颈在哪一段用数据说话
    const tm = { prep: 0, raster: 0, video: 0, draw: 0, enc: 0, rasterN: 0 };
    const expT0 = performance.now();
    for (let i = 0; i < total; i++) {
      if (opts.shouldCancel?.()) throw new ExportCanceled();
      const t = i / FPS;
      const tPrep = performance.now();
      overlay.win.__hfPreview!.seekTimelines(t);
      const { seg, srcT } = segAt(t);
      const rig = rigs.get(seg.key);
      // 取景变换统一读 #vidEl:canvas 模式下所有段(含插入段)的取景关键帧都打在这块
      // 画布上(videoFrameTimelineBody 只 tl.to('#vidEl'));按 clip_<id> 找元素是
      // 旧「插入段=独立 <video>」时代的残留,元素不存在→单位矩阵→导出丢插入段取景
      const el = overlay.doc.getElementById('vidEl');
      const vs = readTransform(overlay.win, el);
      const serial = serializeVisible();
      tm.prep += performance.now() - tPrep;
      const hot = serial !== lastSerial || !lastOverlayImg;
      if (hot) tm.rasterN++;
      const overlayP: Promise<HTMLImageElement> = hot
        ? (() => {
            const s0 = performance.now();
            return rasterize(preEnc + encodeURIComponent(serial) + postEnc).then((img) => ((tm.raster += performance.now() - s0), img));
          })()
        : Promise.resolve(lastOverlayImg!);

      const tr = trsX.find((x) => t >= x.cut - x.half && t <= x.cut + x.half) ?? null;
      // 影子取样参数先算好,三路解码(叠加层/当前帧/影子帧)互不依赖 → 并行
      const pre = tr ? t < tr.cut : false;
      const gseg = tr ? (pre ? tr.segB : tr.segA) : null;
      const gRig = tr ? rigs.get(pre ? tr.preKey : tr.postKey) : undefined;
      const gSrcT = tr && gseg ? (pre ? Math.max(0, gseg.srcStart - (tr.cut - t)) : gseg.srcEnd + (t - tr.cut)) : 0;
      const v0 = performance.now();
      const [overlayImg, sample, gSample] = await Promise.all([
        overlayP,
        rig ? sampleAt(rig, srcT).then((s) => ((tm.video += performance.now() - v0), s)) : null,
        gRig ? sampleAt(gRig, gSrcT) : null,
      ]);
      lastSerial = serial;
      lastOverlayImg = overlayImg;
      // bg / overlay 已按输出分辨率(outW×outH)栅格化 → 恒等变换 1:1 画(4K 时文字/图形清晰)。
      // 源视频仍在 comp 坐标系画,setTransform(Sx) 把目标矩形放到输出尺寸,drawImage 从原生帧直缩过去。
      // 单侧视频层绘制管线(live 与 ghost 共用):取景变换 + 圆角裁剪 + 投影 + 镜级调色
      const paintLayer = (tc: OffscreenCanvasRenderingContext2D, smp: { draw: (c2: OffscreenCanvasRenderingContext2D, x: number, y: number, w2: number, h2: number) => void }, rg: SourceRig, filterCss?: string) => {
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.clearRect(0, 0, outW, outH);
        tc.setTransform(Sx, 0, 0, Sy, 0, 0);
        tc.save();
        // transform-origin: center —— computed matrix 不含 origin,手动夹 T(c)·M·T(-c)
        tc.translate(W / 2, H / 2);
        tc.transform(vs.m.a, vs.m.b, vs.m.c, vs.m.d, vs.m.e, vs.m.f);
        tc.translate(-W / 2, -H / 2);
        const path = new Path2D();
        path.roundRect(0, 0, W, H, vs.radius);
        if (vs.m.a < 0.999) {
          // 缩小取景才看得到投影:先带 shadow 填底,再裁剪画帧
          tc.shadowColor = 'rgba(0,0,0,0.45)';
          tc.shadowBlur = 90;
          tc.shadowOffsetY = 30;
          tc.fillStyle = '#000';
          tc.fill(path);
          tc.shadowColor = 'transparent';
          tc.shadowBlur = 0;
          tc.shadowOffsetY = 0;
        }
        tc.clip(path);
        // 镜级调色:与预览 #vidEl 的 CSS filter 同源(canvas filter 同一语法);restore 复位
        if (filterCss) tc.filter = filterCss;
        smp.draw(tc, (W - rg.dw) / 2, (H - rg.dh) / 2, rg.dw, rg.dh);
        tc.restore();
        tc.setTransform(1, 0, 0, 1, 0, 0);
      };
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, outW, outH);
      if (sample && rig) paintLayer(lctx, sample, rig, seg.filter);
      // 影子层:窗口内"另一侧"的画面(真双流;取样越界/缺席 = 硬切降级)
      let ghostReady = false;
      if (tr) {
        gctx.setTransform(1, 0, 0, 1, 0, 0);
        gctx.clearRect(0, 0, outW, outH);
        if (gSample && gRig && gseg) {
          paintLayer(gctx, gSample, gRig, gseg.filter);
          ghostReady = true;
        }
      }
      // 合成进 vidC:gl-transitions 合成器(与预览 shim / 面板同一份 GL_MIXER_SRC);
      // 影子缺席/GL 不可用 → 硬切降级
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.clearRect(0, 0, outW, outH);
      let mixed = false;
      if (tr && ghostReady && mixer) {
        const p = Math.min(1, Math.max(0, (t - (tr.cut - tr.half)) / (2 * tr.half))); // 0=窗口起点 1=终点
        const F = pre ? liveC : ghostC;
        const T = pre ? ghostC : liveC;
        const [dx, dy] = glDirection(tr.dir as TransitionDirection);
        if (mixer.render(F, T, tr.effect, p, dx, dy)) {
          vctx.drawImage(mixer.canvas, 0, 0);
          mixed = true;
        }
      }
      if (!mixed) vctx.drawImage(liveC, 0, 0);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const d0 = performance.now();
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(vidC, 0, 0);
      ctx.drawImage(overlayImg, 0, 0);
      tm.draw += performance.now() - d0;
      const e0 = performance.now();
      if (pendingAdd) await pendingAdd; // 上一帧的编码背压:压到这里才等,编码期间下一帧已在准备
      pendingAdd = videoSource.add(t, 1 / FPS);
      tm.enc += performance.now() - e0;
      // 用完即收(秒检一次):最后使用时刻已过的源收掉视频解码流;影子源连 input 一起收
      if (i % FPS === 0) {
        for (const [key, r2] of rigs) {
          const lu = lastUse.get(key);
          if (lu !== undefined && t > lu + 0.5 && r2.it) {
            retireVideoStream(r2);
            if (key.startsWith('g_')) {
              void r2.input.dispose();
              rigs.delete(key);
            }
          }
        }
      }
      opts.onProgress?.(i + 1, total);
    }
    if (pendingAdd) await pendingAdd;
    {
      const wall = (performance.now() - expT0) / 1000;
      const pct = (x: number) => `${Math.round((x / 1000 / wall) * 100)}%`;
      console.info(
        `[export] ${total}帧/${durationSec.toFixed(1)}s → ${wall.toFixed(1)}s(${(durationSec / wall).toFixed(2)}x)· ` +
          `光栅化 ${pct(tm.raster)}(热帧 ${tm.rasterN}/${total})· 取帧 ${pct(tm.video)} · 布局 ${pct(tm.prep)} · 合成 ${pct(tm.draw)} · 编码等待 ${pct(tm.enc)}`,
      );
    }

    // 音轨:按成片段序拼接(主段=口播音轨,插入段=它自己的音轨),重打时间戳
    if (audioSource) {
      let edited = 0;
      for (const s of segs) {
        const rig = rigs.get(s.key);
        if (rig?.audio) {
          const asink = new AudioSampleSink(rig.audio);
          for await (const sample of asink.samples(s.srcStart, s.srcEnd)) {
            sample.setTimestamp(Math.max(0, edited + (sample.timestamp - s.srcStart)));
            await audioSource.add(sample);
            sample.close();
          }
        }
        edited += Math.max(0, s.srcEnd - s.srcStart);
      }
    }

    await output.finalize();
    const buf = (output.target as BufferTarget).buffer!;
    return new Blob([buf], { type: render.format === 'webm' ? 'video/webm' : render.format === 'mov' ? 'video/quicktime' : 'video/mp4' });
  } finally {
    for (const rig of rigs.values()) {
      rig.cur?.close();
      rig.pending?.close();
      void rig.input.dispose();
    }
    overlay.dispose();
  }
}
