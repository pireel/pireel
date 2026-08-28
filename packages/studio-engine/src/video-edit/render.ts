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

/** Audio fade in/out duration (seconds) at segment edges, kills the click/abruptness of hard cuts */
const AUDIO_FADE = 0.05;

/**
 * Timeline → mp4 render (pure browser, WebCodecs).
 *
 * Supports "audio/video separation": each segment's picture and sound can come from different clips.
 * Picture is uniformly cover-fit to portrait 9:16, with optional burned-in captions.
 *
 * A/V sync notes (gotchas learned the hard way):
 *   - Each segment's video/audio is zeroed to its "first-sample timestamp within the segment", then offset by the global timeOffset
 *   - timeOffset accumulates by the segment's visual length (video.end - video.start); audio is trimmed to the same length to avoid drift
 *
 * Limits (future work): BufferTarget holds the whole clip in memory (fine for <60s); no BGM / intro-outro / transitions yet.
 */

/**
 * Default font: Ximaiti (free for commercial use, a bold-black title face comparable to Wenyue Xinqingnian) + system Chinese fallback.
 * Wenyue Xinqingnian requires a commercial license; government deliverables can't use unlicensed copies, so we substitute the free Ximaiti.
 */
const FONT_FAMILY = '喜脉体';
export const DEFAULT_FONT = `"${FONT_FAMILY}", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

/** Font file lives here (public/fonts/, root path). Only a successful load can burn Ximaiti, otherwise fall back to system fonts */
const FONT_PATH = '/fonts/ximaiti.woff2';
let fontLoaded: boolean | null = null;

/** Ensure the font is ready before rendering. Failures don't throw (fall back to system fonts), only mark once */
async function ensureFont(): Promise<void> {
  if (fontLoaded !== null) return;
  if (typeof FontFace === 'undefined') {
    fontLoaded = false;
    return;
  }
  try {
    // Use an absolute origin URL to bypass next-intl's /zh prefix (otherwise the request becomes /zh/fonts/... and 404s)
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
  /** Segment length (seconds), = video range length */
  dur: number;
  audio: { clipId: string; start: number; end: number };
  video: { clipId: string; start: number; end: number };
}

/** Overlay layer (subtitle/caption), timed on the [segment timeline] (t=0 = first segment, excludes intro) */
export interface RenderOverlay {
  /** Defaults to subtitle. caption = big-text overlay (used by auto-edit; the caption editor no longer produces it) */
  kind?: 'subtitle' | 'caption';
  text: string;
  start: number;
  end: number;
  /** Normalized center position (0..1). Preferred when given, otherwise falls back to position. */
  x?: number;
  y?: number;
  position?: 'top' | 'center' | 'bottom';
  emphasis?: 'normal' | 'strong';
  /** Text box width (normalized 0..1 of frame width). Defaults to 0.9. */
  width?: number;
  /** Font-size scale, 1 = default. Kept in sync between preview and burn-in. */
  fontScale?: number;
  /** Font color, defaults to #fff. */
  color?: string;
  /** Stroke color, defaults to #000; 'none' disables the stroke. */
  strokeColor?: string;
  /** Background block color, defaults to none. */
  bgColor?: string;
  /** Animated captions: setting effect + words takes the per-word animation branch (native canvas), no longer drawing static captions. */
  effect?: CaptionEffect;
  words?: FxWord[];
  /** Highlight/karaoke accent color. */
  accentColor?: string;
}

/** Seam transition ("marker" model: total duration unchanged, composited within a duration/2 window on each side of the seam). */
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
  /** Index of the segment left of the seam (between segments[afterIndex] and segments[afterIndex+1]) */
  afterIndex: number;
  type: RenderTransitionType;
  /** Total duration (seconds), split half per side */
  duration: number;
  dir?: RenderTransitionDir;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  /** Override the default export bitrate for small internal review proxies. */
  videoBitrate?: number;
  /** Subtitle/caption layer (absolute seconds on the segment timeline) */
  overlays?: RenderOverlay[];
  /** Seam transitions (keyed by afterIndex) */
  transitions?: RenderTransition[];
  /** Text font family, defaults to Xinqingnian + system fallback */
  fontFamily?: string;
  /** Intro title (empty = no intro) */
  title?: string;
  /** Outro credit (empty = no outro) */
  outro?: string;
  /** Submitting org, shown as the intro subtitle */
  orgName?: string;
  /** Intro duration in seconds, defaults to 2.5 */
  introDuration?: number;
  /** Outro duration in seconds, defaults to 2.5 */
  outroDuration?: number;
  onProgress?: (p: number) => void;
}

/** Per-clip Input + sink cache, avoids reopening a clip referenced by multiple segments */
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
    // First determine whether there's any audio source, to decide whether to add an audio track (don't add one if fully silent, or finalize hangs)
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
      bitrate: opts.videoBitrate ?? QUALITY_HIGH,
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

    // ---- Seam transitions: pre-grab still frames on both sides + half-window length h per seam (marker model: total duration unchanged) ----
    // At export, composite within [seam-h, seam+h]: the left half mixes in the "next segment's first frame" still, the right half the "previous segment's last frame" still,
    // without extending clips or moving segments. If preparing a single transition fails, skip it (that seam falls back to a hard cut) rather than sinking the whole export.
    const targetLens = segments.map((s) => Math.max(0.1, s.dur || Math.max(0.1, s.video.end - s.video.start)));
    const txBySeam = new Map<number, SeamTx>();
    const tmp = new OffscreenCanvas(W, H);
    const tmpCtx = tmp.getContext('2d') as OffscreenCanvasRenderingContext2D;
    for (const t of opts.transitions ?? []) {
      try {
        const i = t.afterIndex;
        if (i < 0 || i >= segments.length - 1) continue;
        // Half-window ≤ 45% of either neighboring segment (so head/tail windows don't overlap on a short middle segment), and ≤ 1s
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
        // Skip this transition
      }
    }

    let timeOffset = 0;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const videoRange = Math.max(0.1, seg.video.end - seg.video.start);

      // ---- Picture ----
      const vh = await open(seg.video.clipId);
      // Clip not found (clipId mismatch) → skip the whole segment without advancing timeOffset, to avoid a black gap
      if (!vh?.videoTrack) {
        opts.onProgress?.((si + 1) / segments.length);
        continue;
      }
      // Target segment length = the dur the arrangement gave (dialogue segments are already aligned to whole sentences). Audio plays fully; if the picture is short, freeze-frame to fill.
      const targetLen = Math.max(0.1, seg.dur || videoRange);

      vh.videoSink ??= new VideoSampleSink(vh.videoTrack);
      let segEnd = 0; // Actual decoded picture length
      for await (const sample of vh.videoSink.samples(seg.video.start, seg.video.end)) {
        // try/finally ensures close() on every path (including videoSource.add throwing), avoiding VideoSample leaks
        try {
          // Use the "request start" as the common zero point (not each track's first sample) — for face segments, picture and audio share source and start, so lip sync is exact
          const rel = Math.max(0, sample.timestamp - seg.video.start);
          // Upper bound uses targetLen, not videoRange: a B-roll range may be longer than the whole sentence;
          // cut when exceeded, otherwise video frames would spill into the next segment's time range → timestamp-goes-backward error
          if (rel >= targetLen) break;
          drawCoverFit(ctx, sample, W, H);
          // Seam transition compositing (before captions: captions sit on top of the transition). Only acts when hitting a head/tail window, otherwise passes through unchanged.
          if (txBySeam.size) applyTransition(ctx, tmp, tmpCtx, txBySeam, si, rel, targetLen, W, H);
          // While an intro/outro title card is showing, suppress the big-text caption (both are big titling text; stacking them = duplicate layers)
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

      // Picture shorter than target (audio is the full sentence but the B-roll picture isn't long enough) → freeze the current frame to fill, so audio isn't cut
      if (segEnd > 0 && segEnd < targetLen - 0.05) {
        const step = 0.4;
        for (let t = segEnd; t < targetLen - 1e-6; t += step) {
          await videoSource.add(timeOffset + t, Math.min(step, targetLen - t));
        }
      }

      // ---- Audio (trimmed to target segment length) ----
      if (audioSource) {
        const ah = await open(seg.audio.clipId);
        if (ah?.audioTrack) {
          ah.audioSink ??= new AudioSampleSink(ah.audioTrack);
          for await (const a of ah.audioSink.samples(seg.audio.start, seg.audio.end)) {
            try {
              // Also zeroed to the request start, sharing the video's timeOffset origin → A/V aligned
              const relA = Math.max(0, a.timestamp - seg.audio.start);
              if (relA >= targetLen) break;
              // 50ms fade in/out at each segment edge, kills hard-cut clicks; middle passes through unchanged
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
        // Ignore dispose errors
      }
    }
  }
}

/**
 * Fade audio in/out at segment edges. Only processes chunks in the head 50ms / tail 50ms (middle returns null to pass through, saving cost).
 * Reads f32 interleaved PCM, multiplies a gain ramp per frame, produces a new AudioSample. Any exception returns null (falls back to original, doesn't break rendering).
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
    sample.copyTo(buf, { planeIndex: 0, format: 'f32' }); // interleaved
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
    return null; // Fallback: use the original sample
  }
}

/** Cover-scale the source frame to fill the portrait frame, center-cropped. sample.draw handles rotation metadata */
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

// ===== Seam transition compositing =====

/** One seam's transition data: half-window h + still frames on both sides (cover-fit to a W×H offscreen canvas). */
interface SeamTx {
  type: RenderTransitionType;
  dir: RenderTransitionDir;
  h: number;
  /** Previous segment's (outgoing) last frame — used by the right half-window */
  outStill: OffscreenCanvas;
  /** Next segment's (incoming) first frame — used by the left half-window */
  inStill: OffscreenCanvas;
}

const clampNum = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Grab a single frame → cover-fit to a W×H offscreen canvas. Returns null on failure (caller falls back to a hard cut). */
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
      return c; // First frame is enough
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * If a seam head/tail window is hit, composite the transition in place. ctx already holds the current (live) frame.
 * Tail window (outgoing segment's right edge [targetLen-h, targetLen]): half='out', p 0→0.5;
 * head window (incoming segment's left edge [0, h]): half='in', p 0.5→1. The two windows don't overlap on a short middle segment (h ≤ 45% of segment length).
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
      // Composite failed → keep the live frame (hard cut)
    }
    return;
  }
  const head = txBySeam.get(si - 1);
  if (head && rel < head.h) {
    const q = clamp01(rel / head.h);
    try {
      compositeTransition(ctx, tmp, tmpCtx, head.outStill, head.type, head.dir, 0.5 + 0.5 * q, 'in', W, H);
    } catch {
      // Same as above
    }
  }
}

/**
 * Composite from→to onto ctx per effect. p is overall transition progress (0→1).
 * half='out': from=live (outgoing segment), to=opposite still (incoming first frame); half='in': from=opposite still (outgoing last frame), to=live (incoming segment).
 * live is already on ctx → snapshot it into tmp first, then clear and recompose, so push/slide can translate the live layer as a whole.
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
      // Fade to black first (p→0.5) then fade out (0.5→1), no crossfade
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
      // Square-wave jitter layered on the crossfade alpha → the two layers flicker back and forth
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

/** push: from/to translate together (the new clip pushes the old one out). dir = the new clip's entry direction. */
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

/** slide: from stays put, to slides in from one side to cover it. */
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

/** Draw all overlays active at the current time. Subtitles first, then captions (captions on top) */
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
  // Animated captions take priority: those with effect+words go to the per-word animation branch (native canvas), no static layer drawn
  for (const o of active) {
    if (hasCaptionFx(o)) drawCaptionFx(ctx, o as CaptionFxInput, t, W, H, font);
  }
  for (const o of active.filter((o) => !hasCaptionFx(o) && (o.kind ?? 'subtitle') === 'subtitle')) {
    drawSubtitleLayer(ctx, o, W, H, font);
  }
  if (suppressCaption) return; // Don't draw captions during intro/outro title cards, to avoid two big-text layers overlapping
  for (const o of active.filter((o) => !hasCaptionFx(o) && o.kind === 'caption')) {
    drawCaptionLayer(ctx, o, W, H, font);
  }
}

/** Bottom dialogue subtitle: small text, white with black stroke, auto-wrapped. Supports position (top/center/bottom) + font-size scale + color. */
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
  // Use normalized center if x/y given; otherwise fall back to position (auto-edit compatibility)
  const cy =
    o.x != null || o.y != null
      ? (o.y ?? 0.88) * H
      : o.position === 'top'
        ? H * 0.1 + blockH / 2
        : o.position === 'center'
          ? H / 2
          : H - H * 0.08 - blockH / 2;

  // Background block
  if (o.bgColor && o.bgColor !== 'none') {
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const pad = fontSize * 0.3;
    ctx.fillStyle = o.bgColor;
    roundRect(ctx, cx - maxW / 2 - pad, cy - blockH / 2 - pad * 0.5, maxW + pad * 2, blockH + pad, fontSize * 0.18);
    ctx.fill();
  }

  // Stroke (defaults to black; 'none' disables)
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

/** Caption / animated text: large text, top or center, strong gets a semi-transparent color block behind it */
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
    // Semi-transparent color block, boosts readability + visual impact
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
 * Intro title / outro credit, laid over the live picture (option B, not a solid-color card).
 * The picture is already laid down by drawCoverFit; here we add a semi-transparent dim layer + centered large text + subtitle (org name),
 * so the text stays legible over any picture.
 */
function drawCardText(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  orgName: string | undefined,
  W: number,
  H: number,
  font: string,
) {
  // Semi-transparent full-screen dim, makes text more readable
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
  return lines.slice(0, 3); // Max 3 lines, truncate if longer
}
