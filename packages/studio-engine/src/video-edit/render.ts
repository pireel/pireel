import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  VideoSampleSink,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { type CaptionEffect, type CaptionFxInput, type FxWord, drawCaptionFx, hasCaptionFx } from '../caption-fx';

/** 段边缘音频淡入淡出时长(秒),消除硬切的咔哒/突兀 */
const AUDIO_FADE = 0.05;

/**
 * Timeline → mp4 渲染(纯浏览器,WebCodecs)。
 *
 * 支持"声画分离":每段的画面和声音可来自不同素材。
 * 画面统一 cover-fit 到竖屏 9:16,可选烧录字幕。
 *
 * A/V 同步要点(踩过的坑):
 *   - 每段画面/音频各自以"段内首帧时间戳"为原点归零,再加全局 timeOffset
 *   - timeOffset 按段的视觉时长(video.end - video.start)累加,音频裁到同长,避免漂移
 *
 * 限制(后续迭代):BufferTarget 整片入内存(<60s 没问题);暂无 BGM / 片头尾 / 转场。
 */

/**
 * 默认字体:字制区喜脉体(免费商用,媲美文悦新青年体的粗黑标题体)+ 系统中文兜底。
 * 文悦新青年体是商用授权字体,政务交付不能用未授权版,故选公益免费的喜脉体替代。
 */
const FONT_FAMILY = '喜脉体';
export const DEFAULT_FONT = `"${FONT_FAMILY}", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

/** 字体文件放这(public/fonts/,根路径)。加载成功才能烧出喜脉体,否则回退系统字体 */
const FONT_PATH = '/fonts/ximaiti.woff2';
let fontLoaded: boolean | null = null;

/** 渲染前确保字体就绪。失败不抛错(回退系统字体),只标记一次 */
async function ensureFont(): Promise<void> {
  if (fontLoaded !== null) return;
  if (typeof FontFace === 'undefined') {
    fontLoaded = false;
    return;
  }
  try {
    // 用绝对 origin URL,绕开 next-intl 的 /zh 前缀(否则会请求成 /zh/fonts/... 而 404)
    const origin = typeof location !== 'undefined' ? location.origin : '';
    const face = new FontFace(FONT_FAMILY, `url("${origin}${FONT_PATH}")`);
    await face.load();
    (globalThis as unknown as { fonts?: FontFaceSet }).fonts?.add(face);
    fontLoaded = true;
  } catch {
    fontLoaded = false;
  }
}

export interface RenderSegment {
  /** 段时长(秒),= video 区间长度 */
  dur: number;
  audio: { clipId: string; start: number; end: number };
  video: { clipId: string; start: number; end: number };
}

/** 覆盖层(字幕/大字报),时间在【段时间轴】上(t=0=首段,不含片头) */
export interface RenderOverlay {
  /** 缺省 subtitle。caption=大字报(auto-edit 用,字幕编辑器已不产出) */
  kind?: 'subtitle' | 'caption';
  text: string;
  start: number;
  end: number;
  /** 归一化中心位置(0..1)。给了优先用,否则回退 position。 */
  x?: number;
  y?: number;
  position?: 'top' | 'center' | 'bottom';
  emphasis?: 'normal' | 'strong';
  /** 文本框宽度(归一化 0..1 帧宽)。缺省 0.9。 */
  width?: number;
  /** 字号缩放,1=默认。预览与烧录同步。 */
  fontScale?: number;
  /** 字体颜色,默认 #fff。 */
  color?: string;
  /** 描边色,缺省 #000;'none' 关闭描边。 */
  strokeColor?: string;
  /** 背景底块色,缺省无。 */
  bgColor?: string;
  /** 动效花字:设了 effect + words 即走逐词动画分支(canvas 原生),不再画静态字幕。 */
  effect?: CaptionEffect;
  words?: FxWord[];
  /** 高亮/卡拉OK 强调色。 */
  accentColor?: string;
}

/** 接缝转场（「标记」模型：不改总时长，在接缝两侧各 duration/2 的窗口内合成）。 */
export type RenderTransitionType =
  | 'dissolve'
  | 'fade'
  | 'push'
  | 'slide'
  | 'scale'
  | 'spin'
  | 'flicker';
export type RenderTransitionDir = 'left' | 'right' | 'up' | 'down';
export interface RenderTransition {
  /** 接缝左段下标（在 segments[afterIndex] 与 segments[afterIndex+1] 之间） */
  afterIndex: number;
  type: RenderTransitionType;
  /** 总时长（秒），两侧各半 */
  duration: number;
  dir?: RenderTransitionDir;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  /** 字幕/大字报层(段时间轴绝对秒) */
  overlays?: RenderOverlay[];
  /** 接缝转场（按 afterIndex） */
  transitions?: RenderTransition[];
  /** 文字字体族,默认新青年体 + 系统兜底 */
  fontFamily?: string;
  /** 片头标题(空则不加片头) */
  title?: string;
  /** 片尾落款(空则不加片尾) */
  outro?: string;
  /** 投稿单位,显示在片头副标题 */
  orgName?: string;
  /** 片头时长秒,默认 2.5 */
  introDuration?: number;
  /** 片尾时长秒,默认 2.5 */
  outroDuration?: number;
  onProgress?: (p: number) => void;
}

/** 每个素材的 Input + sink 缓存,避免一个素材被多段引用时反复打开 */
type ClipHandle = {
  input: Input;
  videoTrack: InputVideoTrack | null;
  audioTrack: InputAudioTrack | null;
  videoSink?: VideoSampleSink;
  audioSink?: AudioSampleSink;
};

export async function renderTimeline(
  getFile: (clipId: string) => File | undefined,
  segments: RenderSegment[],
  opts: RenderOptions = {},
): Promise<Blob> {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const font = opts.fontFamily ?? DEFAULT_FONT;
  const overlays = opts.overlays ?? [];
  await ensureFont();

  const handles = new Map<string, ClipHandle>();
  const open = async (clipId: string): Promise<ClipHandle | null> => {
    const cached = handles.get(clipId);
    if (cached) return cached;
    const file = getFile(clipId);
    if (!file) return null;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const handle: ClipHandle = {
      input,
      videoTrack: await input.getPrimaryVideoTrack(),
      audioTrack: await input.getPrimaryAudioTrack(),
    };
    handles.set(clipId, handle);
    return handle;
  };

  try {
    // 先确定有没有任何音频源,决定要不要加音轨(全程无声就别加,免得 finalize 卡)
    const audioClipIds = new Set(segments.map((s) => s.audio.clipId));
    let anyAudio = false;
    for (const id of audioClipIds) {
      const h = await open(id);
      if (h?.audioTrack) {
        anyAudio = true;
        break;
      }
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      keyFrameInterval: 1,
    });
    output.addVideoTrack(videoSource);
    const audioSource = anyAudio
      ? new AudioSampleSource({ codec: 'aac', bitrate: QUALITY_MEDIUM })
      : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    const introDur = opts.introDuration ?? 2.5;
    const outroDur = opts.outroDuration ?? 2.5;
    const lastIndex = segments.length - 1;

    // ---- 接缝转场：预抽两侧定格帧 + 每接缝半窗时长 h（标记模型：不改总时长）----
    // 出片时在 [接缝-h, 接缝+h] 内合成：左半用「下一段首帧」定格混入，右半用「上一段末帧」定格混入，
    // 不外扩素材、不移动片段。单个转场预备失败即跳过（该接缝回退硬切），不拖垮整片导出。
    const targetLens = segments.map((s) => Math.max(0.1, s.dur || Math.max(0.1, s.video.end - s.video.start)));
    const txBySeam = new Map<number, SeamTx>();
    const tmp = new OffscreenCanvas(W, H);
    const tmpCtx = tmp.getContext('2d') as OffscreenCanvasRenderingContext2D;
    for (const t of opts.transitions ?? []) {
      try {
        const i = t.afterIndex;
        if (i < 0 || i >= segments.length - 1) continue;
        // 半窗 ≤ 任一相邻段的 45%（头尾窗不会在中间短段上重叠），且 ≤ 1s
        const h = Math.min(t.duration / 2, 0.45 * targetLens[i], 0.45 * targetLens[i + 1], 1);
        if (h < 0.03) continue;
        const oh = await open(segments[i].video.clipId);
        const ih = await open(segments[i + 1].video.clipId);
        if (!oh?.videoTrack || !ih?.videoTrack) continue;
        const segOut = segments[i].video;
        const outAt = clampNum(
          segOut.start + Math.min(targetLens[i], Math.max(0.1, segOut.end - segOut.start)) - 0.06,
          segOut.start,
          segOut.end - 0.001,
        );
        const outStill = await grabStill(oh.videoTrack, outAt, segOut.end, W, H);
        const inStill = await grabStill(ih.videoTrack, segments[i + 1].video.start, segments[i + 1].video.end, W, H);
        if (!outStill || !inStill) continue;
        txBySeam.set(i, { type: t.type, dir: t.dir ?? 'left', h, outStill, inStill });
      } catch {
        // 跳过该转场
      }
    }

    let timeOffset = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const videoRange = Math.max(0.1, seg.video.end - seg.video.start);

      // ---- 画面 ----
      const vh = await open(seg.video.clipId);
      // 素材找不到(clipId 对不上)→ 整段跳过,不推进 timeOffset,避免留黑屏空白 gap
      if (!vh?.videoTrack) {
        opts.onProgress?.((si + 1) / segments.length);
        continue;
      }
      // 目标段长 = 编排给的 dur(有对白段已按整句对齐)。声音完整播,画面不够则定格补帧。
      const targetLen = Math.max(0.1, seg.dur || videoRange);

      vh.videoSink ??= new VideoSampleSink(vh.videoTrack);
      let segEnd = 0; // 实际解码到的画面长
      for await (const sample of vh.videoSink.samples(seg.video.start, seg.video.end)) {
        // try/finally 保证任何路径(含 videoSource.add 抛错)都 close,避免 VideoSample 泄漏
        try {
          // 以"请求起点"为共同零点(不是各轨首采样)——露脸段画面/声音同源同起点,嘴型精确对齐
          const rel = Math.max(0, sample.timestamp - seg.video.start);
          // 上界用 targetLen 不是 videoRange:B-roll 区间可能比整句长,
          // 超出就切,否则视频帧会越界到下一段时间区间 → 时间戳倒退报错
          if (rel >= targetLen) break;
          drawCoverFit(ctx, sample, W, H);
          // 接缝转场合成（先于字幕：字幕压在转场之上）。命中头/尾窗才动，否则原样直通。
          if (txBySeam.size) applyTransition(ctx, tmp, tmpCtx, txBySeam, si, rel, targetLen, W, H);
          // 片头/片尾标题卡显示期间,抑制大字报 caption(两者都是大字点题,叠一起=两层重复)
          const inTitle = si === 0 && !!opts.title && rel < introDur;
          const inOutro = si === lastIndex && !!opts.outro && rel > targetLen - outroDur;
          drawOverlays(ctx, overlays, timeOffset + rel, W, H, font, inTitle || inOutro);
          if (inTitle) drawCardText(ctx, opts.title!, opts.orgName, W, H, font);
          if (inOutro) drawCardText(ctx, opts.outro!, opts.orgName, W, H, font);
          await videoSource.add(timeOffset + rel, sample.duration);
          segEnd = Math.max(segEnd, rel + (sample.duration || 0));
        } finally {
          sample.close();
        }
      }

      // 画面比目标短(声音是完整整句而画面 B-roll 不够长)→ 定格当前帧补满,声音不被切
      if (segEnd > 0 && segEnd < targetLen - 0.05) {
        const step = 0.4;
        for (let t = segEnd; t < targetLen - 1e-6; t += step) {
          await videoSource.add(timeOffset + t, Math.min(step, targetLen - t));
        }
      }

      // ---- 声音(裁到目标段长)----
      if (audioSource) {
        const ah = await open(seg.audio.clipId);
        if (ah?.audioTrack) {
          ah.audioSink ??= new AudioSampleSink(ah.audioTrack);
          for await (const a of ah.audioSink.samples(seg.audio.start, seg.audio.end)) {
            try {
              // 同样以请求起点为零点,与视频共用 timeOffset 原点 → 声画对齐
              const relA = Math.max(0, a.timestamp - seg.audio.start);
              if (relA >= targetLen) break;
              // 段头尾各 50ms 淡入淡出,消除硬切咔哒;中段原样直通
              const faded = fadeEdges(a, relA, targetLen, timeOffset + relA);
              if (faded) {
                try {
                  await audioSource.add(faded);
                } finally {
                  faded.close();
                }
              } else {
                a.setTimestamp(timeOffset + relA);
                await audioSource.add(a);
              }
            } finally {
              a.close();
            }
          }
        }
      }

      timeOffset += targetLen;
      opts.onProgress?.((si + 1) / segments.length);
    }

    await output.finalize();
    return new Blob([(output.target as BufferTarget).buffer!], { type: 'video/mp4' });
  } finally {
    for (const h of handles.values()) {
      try {
        h.input.dispose();
      } catch {
        // 忽略 dispose 异常
      }
    }
  }
}

/**
 * 段边缘音频淡入淡出。只处理落在头 50ms / 尾 50ms 的 chunk(中段返回 null 直通,省开销)。
 * 读 f32 交错 PCM,逐帧乘增益斜坡,产新 AudioSample。任何异常返回 null(回退原样,不破坏渲染)。
 */
function fadeEdges(
  sample: AudioSample,
  relA: number,
  targetLen: number,
  newTimestamp: number,
): AudioSample | null {
  const dur = sample.duration;
  const inHead = relA < AUDIO_FADE;
  const inTail = relA + dur > targetLen - AUDIO_FADE;
  if (!inHead && !inTail) return null;
  try {
    const ch = sample.numberOfChannels;
    const frames = sample.numberOfFrames;
    const sr = sample.sampleRate;
    const size = sample.allocationSize({ planeIndex: 0, format: 'f32' });
    const buf = new Float32Array(size / 4);
    sample.copyTo(buf, { planeIndex: 0, format: 'f32' }); // 交错
    for (let f = 0; f < frames; f++) {
      const t = relA + f / sr;
      let g = 1;
      if (t < AUDIO_FADE) g = Math.min(g, t / AUDIO_FADE);
      if (t > targetLen - AUDIO_FADE) g = Math.min(g, Math.max(0, (targetLen - t) / AUDIO_FADE));
      if (g < 1) for (let c = 0; c < ch; c++) buf[f * ch + c] *= g;
    }
    return new AudioSample({
      data: buf,
      format: 'f32',
      numberOfChannels: ch,
      sampleRate: sr,
      timestamp: newTimestamp,
    });
  } catch {
    return null; // 回退:用原 sample
  }
}

/** 把源帧按 cover 缩放铺满竖屏,居中裁切。sample.draw 会处理旋转元数据 */
function drawCoverFit(
  ctx: OffscreenCanvasRenderingContext2D,
  sample: { displayWidth: number; displayHeight: number; draw: (c: OffscreenCanvasRenderingContext2D, dx: number, dy: number, dw?: number, dh?: number) => void },
  W: number,
  H: number,
) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const sw = sample.displayWidth || W;
  const sh = sample.displayHeight || H;
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  sample.draw(ctx, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// ===== 接缝转场合成 =====

/** 一个接缝的转场数据：半窗 h + 两侧定格帧（cover-fit 到 W×H 的离屏画布）。 */
interface SeamTx {
  type: RenderTransitionType;
  dir: RenderTransitionDir;
  h: number;
  /** 上一段(出场)末帧——右半窗用 */
  outStill: OffscreenCanvas;
  /** 下一段(入场)首帧——左半窗用 */
  inStill: OffscreenCanvas;
}

const clampNum = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 抓单帧 → cover-fit 到 W×H 离屏画布。失败返回 null（调用方回退硬切）。 */
async function grabStill(
  track: InputVideoTrack,
  at: number,
  end: number,
  W: number,
  H: number,
): Promise<OffscreenCanvas | null> {
  try {
    const sink = new VideoSampleSink(track);
    const c = new OffscreenCanvas(W, H);
    const cx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    for await (const s of sink.samples(at, Math.max(at + 0.001, end))) {
      try {
        drawCoverFit(cx, s, W, H);
      } finally {
        s.close();
      }
      return c; // 只要首帧
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 命中接缝头/尾窗则就地合成转场。ctx 已画好当前(live)帧。
 * 尾窗(出场段右缘 [targetLen-h, targetLen])：half='out'，p 0→0.5；
 * 头窗(入场段左缘 [0, h])：half='in'，p 0.5→1。两窗在中间短段上不重叠（h≤45%段长）。
 */
function applyTransition(
  ctx: OffscreenCanvasRenderingContext2D,
  tmp: OffscreenCanvas,
  tmpCtx: OffscreenCanvasRenderingContext2D,
  txBySeam: Map<number, SeamTx>,
  si: number,
  rel: number,
  targetLen: number,
  W: number,
  H: number,
) {
  const tail = txBySeam.get(si);
  if (tail && rel > targetLen - tail.h) {
    const q = clamp01((rel - (targetLen - tail.h)) / tail.h);
    try {
      compositeTransition(ctx, tmp, tmpCtx, tail.inStill, tail.type, tail.dir, 0.5 * q, 'out', W, H);
    } catch {
      // 合成失败 → 保留 live 帧（硬切）
    }
    return;
  }
  const head = txBySeam.get(si - 1);
  if (head && rel < head.h) {
    const q = clamp01(rel / head.h);
    try {
      compositeTransition(ctx, tmp, tmpCtx, head.outStill, head.type, head.dir, 0.5 + 0.5 * q, 'in', W, H);
    } catch {
      // 同上
    }
  }
}

/**
 * 按效果把 from→to 合成到 ctx。p 为整段转场进度(0→1)。
 * half='out'：from=live(出场段)、to=对侧定格(入场首帧)；half='in'：from=对侧定格(出场末帧)、to=live(入场段)。
 * live 已在 ctx 上 → 先快照进 tmp，再清屏重组，这样 push/slide 能整体平移 live 层。
 */
function compositeTransition(
  ctx: OffscreenCanvasRenderingContext2D,
  tmp: OffscreenCanvas,
  tmpCtx: OffscreenCanvasRenderingContext2D,
  other: OffscreenCanvas,
  type: RenderTransitionType,
  dir: RenderTransitionDir,
  p: number,
  half: 'out' | 'in',
  W: number,
  H: number,
) {
  tmpCtx.clearRect(0, 0, W, H);
  tmpCtx.drawImage(ctx.canvas, 0, 0);
  const live = tmp;
  const from: OffscreenCanvas = half === 'out' ? live : other;
  const to: OffscreenCanvas = half === 'out' ? other : live;

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  switch (type) {
    case 'dissolve': {
      ctx.drawImage(from, 0, 0, W, H);
      ctx.globalAlpha = p;
      ctx.drawImage(to, 0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }
    case 'fade': {
      // 先淡到黑(p→0.5)再淡出(0.5→1)，不交叉
      if (p < 0.5) {
        ctx.drawImage(from, 0, 0, W, H);
        ctx.globalAlpha = clamp01(2 * p);
      } else {
        ctx.drawImage(to, 0, 0, W, H);
        ctx.globalAlpha = clamp01(2 * (1 - p));
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }
    case 'push': {
      const o = pushOffsets(dir, p, W, H);
      ctx.drawImage(from, o.fx, o.fy, W, H);
      ctx.drawImage(to, o.tx, o.ty, W, H);
      break;
    }
    case 'slide': {
      const o = slideOffset(dir, p, W, H);
      ctx.drawImage(from, 0, 0, W, H);
      ctx.drawImage(to, o.tx, o.ty, W, H);
      break;
    }
    case 'scale': {
      ctx.drawImage(from, 0, 0, W, H);
      const s = 0.6 + 0.4 * p;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.drawImage(to, -W / 2, -H / 2, W, H);
      ctx.restore();
      break;
    }
    case 'spin': {
      ctx.drawImage(from, 0, 0, W, H);
      const s = Math.max(0.04, p);
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(W / 2, H / 2);
      ctx.rotate((1 - p) * Math.PI * 0.5);
      ctx.scale(s, s);
      ctx.drawImage(to, -W / 2, -H / 2, W, H);
      ctx.restore();
      break;
    }
    case 'flicker': {
      ctx.drawImage(from, 0, 0, W, H);
      // 方波抖动叠在交叉透明度上 → 两层来回闪
      const jitter = Math.floor(p * 12) % 2 === 0 ? 0.4 : -0.15;
      ctx.globalAlpha = clamp01(p + jitter);
      ctx.drawImage(to, 0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }
    default: {
      ctx.drawImage(from, 0, 0, W, H);
      ctx.globalAlpha = p;
      ctx.drawImage(to, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

/** push：from/to 一起平移（新片把旧片推出去）。dir = 新片进入方向。 */
function pushOffsets(dir: RenderTransitionDir, p: number, W: number, H: number) {
  switch (dir) {
    case 'right':
      return { fx: p * W, fy: 0, tx: -(1 - p) * W, ty: 0 };
    case 'up':
      return { fx: 0, fy: -p * H, tx: 0, ty: (1 - p) * H };
    case 'down':
      return { fx: 0, fy: p * H, tx: 0, ty: -(1 - p) * H };
    case 'left':
    default:
      return { fx: -p * W, fy: 0, tx: (1 - p) * W, ty: 0 };
  }
}

/** slide：from 不动，to 从一侧滑入盖住。 */
function slideOffset(dir: RenderTransitionDir, p: number, W: number, H: number) {
  switch (dir) {
    case 'right':
      return { tx: -(1 - p) * W, ty: 0 };
    case 'up':
      return { tx: 0, ty: (1 - p) * H };
    case 'down':
      return { tx: 0, ty: -(1 - p) * H };
    case 'left':
    default:
      return { tx: (1 - p) * W, ty: 0 };
  }
}

/** 画出当前时间命中的所有覆盖层。先字幕后大字报(大字报压在上层) */
function drawOverlays(
  ctx: OffscreenCanvasRenderingContext2D,
  overlays: RenderOverlay[],
  t: number,
  W: number,
  H: number,
  font: string,
  suppressCaption = false,
) {
  const active = overlays.filter((o) => t >= o.start && t < o.end);
  // 动效花字优先:命中 effect+words 的走逐词动画分支(canvas 原生),不再画静态层
  for (const o of active) {
    if (hasCaptionFx(o)) drawCaptionFx(ctx, o as CaptionFxInput, t, W, H, font);
  }
  for (const o of active.filter((o) => !hasCaptionFx(o) && (o.kind ?? 'subtitle') === 'subtitle')) {
    drawSubtitleLayer(ctx, o, W, H, font);
  }
  if (suppressCaption) return; // 片头/片尾标题卡期间不画大字报,避免两层大字重叠
  for (const o of active.filter((o) => !hasCaptionFx(o) && o.kind === 'caption')) {
    drawCaptionLayer(ctx, o, W, H, font);
  }
}

/** 底部对白字幕:小字、白字黑描边、自动换行。支持 position(上/中/下) + 字号缩放 + 颜色。 */
function drawSubtitleLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  o: RenderOverlay,
  W: number,
  H: number,
  font: string,
) {
  const fontSize = Math.round(H * 0.032 * (o.fontScale ?? 1));
  ctx.font = `600 ${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, o.text, (o.width ?? 0.9) * W);
  const lineH = fontSize * 1.3;
  const blockH = lines.length * lineH;
  const cx = (o.x ?? 0.5) * W;
  // 有 x/y 用归一化中心；否则回退 position（兼容 auto-edit）
  const cy =
    o.x != null || o.y != null
      ? (o.y ?? 0.88) * H
      : o.position === 'top'
        ? H * 0.1 + blockH / 2
        : o.position === 'center'
          ? H / 2
          : H - H * 0.08 - blockH / 2;

  // 背景底块
  if (o.bgColor && o.bgColor !== 'none') {
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const pad = fontSize * 0.3;
    ctx.fillStyle = o.bgColor;
    roundRect(ctx, cx - maxW / 2 - pad, cy - blockH / 2 - pad * 0.5, maxW + pad * 2, blockH + pad, fontSize * 0.18);
    ctx.fill();
  }

  // 描边（缺省黑；'none' 关闭）
  const stroke = o.strokeColor ?? '#000';
  const hasStroke = !!stroke && stroke !== 'none';
  if (hasStroke) {
    ctx.lineWidth = Math.max(3, fontSize * 0.16);
    ctx.strokeStyle = stroke;
  }
  ctx.fillStyle = o.color ?? '#fff';
  lines.forEach((line, i) => {
    const y = cy - blockH / 2 + lineH / 2 + i * lineH;
    if (hasStroke) ctx.strokeText(line, cx, y);
    ctx.fillText(line, cx, y);
  });
}

/** 大字报/花字:大字,顶部或居中,strong 带半透明色块底 */
function drawCaptionLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  o: RenderOverlay,
  W: number,
  H: number,
  font: string,
) {
  const strong = o.emphasis === 'strong';
  const fontSize = Math.round(H * (strong ? 0.058 : 0.046) * (o.fontScale ?? 1));
  ctx.font = `800 ${fontSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, o.text, W * 0.86);
  const lineH = fontSize * 1.3;
  const blockH = lines.length * lineH;
  const centerY = o.position === 'center' ? H / 2 : H * 0.16 + blockH / 2;

  if (strong) {
    // 半透明色块底,增强可读性 + 视觉冲击
    const pad = fontSize * 0.4;
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    ctx.fillStyle = 'rgba(200,30,30,0.82)';
    roundRect(ctx, (W - maxW) / 2 - pad, centerY - blockH / 2 - pad * 0.6, maxW + pad * 2, blockH + pad * 1.2, fontSize * 0.18);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(4, fontSize * 0.14);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = o.color ?? '#fff';
  lines.forEach((line, i) => {
    const y = centerY - blockH / 2 + lineH / 2 + i * lineH;
    if (!strong) ctx.strokeText(line, W / 2, y);
    ctx.fillText(line, W / 2, y);
  });
}

function roundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 片头标题 / 片尾落款,盖在现场画面上(B 方案,不用纯色卡)。
 * 画面已由 drawCoverFit 铺好,这里加一层半透明压暗 + 居中大字 + 副标题(单位名),
 * 保证文字在任意画面上都清晰。
 */
function drawCardText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  orgName: string | undefined,
  W: number,
  H: number,
  font: string,
) {
  // 半透明压暗整屏,文字更可读
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.round(H * 0.05);
  ctx.font = `700 ${fs}px ${font}`;
  const lines = wrapText(ctx, text, W * 0.84);
  const lineH = fs * 1.4;
  const startY = H / 2 - ((lines.length - 1) * lineH) / 2;
  ctx.lineWidth = Math.max(4, fs * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#fff';
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.strokeText(line, W / 2, y);
    ctx.fillText(line, W / 2, y);
  });

  if (orgName && !text.includes(orgName)) {
    ctx.font = `500 ${Math.round(H * 0.026)}px ${font}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(orgName, W / 2, startY + lines.length * lineH + H * 0.02);
  }
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3); // 最多 3 行,过长截断
}
