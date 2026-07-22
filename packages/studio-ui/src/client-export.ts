/**
 * Client-side export (local compositing, the default path; server render is only a fallback).
 *
 *  Video layer (track 0, multi-source) — each source (main video File / insert-clip File|URL)
 *    gets one sequential MediaBunny sample stream; frames are drawn to canvas per edited time.
 *    Framing transforms are not recomputed — the GSAP/inline computed transform inside the
 *    hidden iframe is copied verbatim per frame (strictly same-source as the preview).
 *  Overlay layer (track ≥1) — after seekTimelines(t) on the same iframe, #root is serialized
 *    into an SVG foreignObject → <img> → drawImage; the rasterizer is Blink itself. Fonts and
 *    in-block images must be inlined as data: (foreignObject rasterization forbids any external
 *    load); the main-track <video> is hidden with !important CSS (TRIM_SHIM's applyMode rewrites
 *    inline opacity on every seek, so inline can't hold it down).
 *  Audio track — concatenated in edited-segment order: main segments take the main video's audio,
 *    insert clips take their own (matching the preview), timestamps re-stamped onto the edited timeline.
 *
 *  Known not exported: picture-in-picture video block frames (video elements can't enter
 *    foreignObject), the person-matte layer (canvas isn't serialized, degrades gracefully outside
 *    preview). Ported from experiments/client-export-spike (gotchas and notes all from real testing).
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

/** Export options (chosen in the dialog): res=short-side pixels (width for portrait), fps, format=container/codec. */
export interface ExportRenderOpts {
  res: number;
  fps: number;
  format: 'mp4' | 'mov' | 'webm';
}
export const DEFAULT_RENDER_OPTS: ExportRenderOpts = { res: 1080, fps: 30, format: 'mp4' };

/* ============================ Sources and segments ============================ */

interface ExpSeg {
  srcStart: number;
  srcEnd: number;
  /** Source key: 'main' or an insert-clip key (clip_<shotId>), used only as the rigs/files Map key. */
  key: string;
  /** Per-shot color grade (CSS filter string; 'none'/absent = no grade) — same shotFilterCss as the preview's #vidEl filter. */
  filter?: string;
}

export interface SourceRig {
  input: Input;
  video: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;
  audio: Awaited<ReturnType<Input['getPrimaryAudioTrack']>>;
  /** Sequential sampling (this source's frame times increase monotonically): current frame + single-frame lookahead. */
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

/** From the sequential stream, take "the last frame with timestamp ≤ srcT" (same as the spike: webm without cues returns null on random access across large ranges). */
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

/* ============================ Overlay layer ============================ */

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
          // Main-track video is drawn by the canvas layer, kept out of DOM rasterization (#vidEl is the canvas; insert clips have no separate element)
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

/** Inline every in-block <img> as a data URI (foreignObject rasterization forbids external loads; cross-origin goes through the /api/media/fetch proxy). */
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
        /* One image failing doesn't block export: it's just absent */
      }
    }),
  );
}

const XS = new XMLSerializer();

function svgOpen(lw: number, lh: number, dw: number, dh: number, css: string): string {
  // SVG must be a data: URI (blob: taints the canvas, verified in the spike).
  // Device size dw×dh (can be > layout size) + viewBox = layout coordinate system: the browser
  // re-rasterizes vector content at the target resolution (crisp 4K text/graphics, rather than
  // upscaling a 1080 bitmap). When dw==lw the viewBox is identity, rendering matches the old version.
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

/* ============================ Main export flow ============================ */

export interface ClientExportOpts {
  comp: Composition;
  videoFile: File;
  /** Local insert-clip Files (key = blob URL, same source as workbench clipFilesRef). */
  clipFiles: Map<string, File>;
  /** Resolution/fps/format (default 1080p·30·MP4). */
  render?: ExportRenderOpts;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

export class ExportCanceled extends Error {
  constructor() {
    super('export canceled');
  }
}

/** Single-frame capture (used by the external agent's capture_frame verification tool): one frame
 *  from the same render pipeline as export — theme background + source video frame (with framing
 *  transform/rounded corners/shadow) + overlay foreignObject rasterization.
 *  Returns a downsampled JPEG dataURL (small enough for LLM context); with no video, draws only background + overlay. */
export async function captureCompositionFrame(opts: {
  comp: Composition;
  videoFile: File | null;
  clipFiles: Map<string, File>;
  atSec: number;
  /** Output long-side pixels (default 960). */
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

  // Find which edited segment t falls in (same logic as export's segAt), open only that one source
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
        rig = null; // Source won't open: degrade to no video frame (overlay still visible)
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
  // Output size: res=short side, downscale only, never upscale; layout/framing all still computed
  // in comp coordinates, one setTransform scales at the canvas end.
  // Width and height each rounded to even (encoder requires it) → Sx/Sy computed independently, no black bars from sub-pixel diff
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  // res=output short-side pixels. Upscaling to 4K relies on the vector layer re-rasterizing at target
  // resolution (svgOpen's viewBox) + the source video drawImage scaling straight from native frames to
  // output (no 1080 intermediate). Cap at 4× as a safety net against canvas/memory blowup (dropdown max 2160=2×).
  const k = Math.min(4, render.res / Math.min(W, H));
  const outW = even(W * k);
  const outH = even(H * k);
  const Sx = outW / W;
  const Sy = outH / H;
  const shots = comp.shots?.length ? comp.shots : [{ id: 'all', srcStart: 0, srcEnd: comp.video?.durationSec ?? 0, treatment: 'full' as const }];
  const durationSec = Math.max(0.5, totalDuration(comp));

  // Segment table (edited order) + each source's File
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

  // Per-source sequential sample stream: start = earliest time this source is used, end = latest
  const rigs = new Map<string, SourceRig>();
  for (const [key, file] of files) {
    const mine = segs.filter((s) => s.key === key);
    if (!mine.length) continue;
    const from = Math.min(...mine.map((s) => s.srcStart));
    const to = Math.max(...mine.map((s) => s.srcEnd));
    rigs.set(key, await openSource(file, from, to, W, H));
  }

  // Overlay document + asset inlining
  const overlay = await createOverlay(injectPreviewRuntime(assembleHtml(comp)), W, H);
  try {
    await inlineImages(overlay.root);
    const fontCss = await buildInlineFontCss(overlay.root.textContent ?? '');
    const css = `${fontCss}\n${overlay.headCss}\n#root{background:transparent !important;}`;
    // Layout coordinate system is always comp's W×H (font-size calibration unchanged); device size =
    // output outW×outH → vectors rasterize crisply at 4K
    const preEnc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOpen(W, H, outW, outH, css));
    const postEnc = encodeURIComponent(SVG_CLOSE);
    // Theme background bitmap (once): empty root goes through the same rasterization pipeline (also at output resolution)
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
    // webm container can't hold aac, so audio switches to opus for that format
    const audioSource = anyAudio ? new AudioSampleSource({ codec: render.format === 'webm' ? 'opus' : 'aac', bitrate: QUALITY_MEDIUM }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // Edited time → segment + time within source (outside any segment / past the end: freeze on the last segment's final frame)
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

    // Cut transitions (true dual-stream, same math as the preview's videoFrameShim): the current frame
    // draws into liveC, the "other side" (before the cut = B's pre-roll handle, after = A's tail handle)
    // draws from a shadow sample stream into ghostC, then composites into vidC by from/to, with p spanning
    // the whole window. Shadow sample out-of-range/absent = hard-cut fallback.
    // Open a separate Input per transition per side: sampleAt is monotonic per stream, and the two sides'
    // time domains don't connect, so they must be separate streams.
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
    // gl-transitions mixer (output resolution; not built if there are no transitions)
    const mixer = trsX.length ? createGlMixer(outW, outH) : null;

    // Last-use time per source video stream (edited time): retire the video decoder once past it — in
    // long projects each transition shadow stream (×2) and each insert clip holds a decoder; letting
    // dozens pile up exhausts the hardware-decode quota and falls back to software (where sampling
    // slows with duration). Can't dispose the input (still needed in the audio stage), only the video
    // sample stream; shadow sources are entirely export-private, so dispose their input too.
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

    // Overlay serialization only takes blocks "visible at this moment": seekTimelines already marks
    // off-window blocks visibility:hidden, and skipping them leaves the hot-frame SVG doc with just a
    // few blocks — parse/layout cost no longer scales with the project's total block count (serializing
    // the whole root, an 11-minute project re-lays-out all several-hundred blocks on every hot frame).
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
    // Overlay frame cache: during tween gaps / static caption periods the serialized string is identical
    // frame to frame → reuse the previous frame's bitmap, skipping parse and rasterization of the whole
    // data URI (with inlined fonts, MB-scale — the bulk of export time).
    let lastSerial = '';
    let lastOverlayImg: HTMLImageElement | null = null;
    // Overlap encoding with next-frame prep: CanvasSource.add grabs the frame synchronously on call, and
    // the returned Promise is only encoder backpressure — the canvas is free to change once grabbed, and
    // we only await the backpressure right before the next frame's add.
    let pendingAdd: Promise<void> | null = null;
    // Per-phase timing (parallel phases each track their own wall clock, so the sum can exceed total wall time): data shows where the bottleneck is
    const tm = { prep: 0, raster: 0, video: 0, draw: 0, enc: 0, rasterN: 0 };
    const expT0 = performance.now();
    for (let i = 0; i < total; i++) {
      if (opts.shouldCancel?.()) throw new ExportCanceled();
      const t = i / FPS;
      const tPrep = performance.now();
      overlay.win.__hfPreview!.seekTimelines(t);
      const { seg, srcT } = segAt(t);
      const rig = rigs.get(seg.key);
      // Read the framing transform uniformly from #vidEl: in canvas mode every segment's (including
      // insert clips') framing keyframes land on this one canvas (videoFrameTimelineBody only does
      // tl.to('#vidEl')); looking up an element by clip_<id> is a leftover from the old "insert clip =
      // separate <video>" era — the element doesn't exist → identity matrix → export loses insert-clip framing
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
      // Compute shadow sampling params first; the three decodes (overlay/current frame/shadow frame) are independent → parallel
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
      // bg / overlay are already rasterized at output resolution (outW×outH) → draw 1:1 with identity
      // transform (crisp text/graphics at 4K). The source video is still drawn in comp coordinates;
      // setTransform(Sx) maps the target rect to output size, drawImage scales straight from native frames.
      // Single-side video layer paint pipeline (shared by live and ghost): framing transform + rounded-corner clip + shadow + per-shot grade
      const paintLayer = (tc: OffscreenCanvasRenderingContext2D, smp: { draw: (c2: OffscreenCanvasRenderingContext2D, x: number, y: number, w2: number, h2: number) => void }, rg: SourceRig, filterCss?: string) => {
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.clearRect(0, 0, outW, outH);
        tc.setTransform(Sx, 0, 0, Sy, 0, 0);
        tc.save();
        // transform-origin: center — the computed matrix excludes origin, so sandwich it manually as T(c)·M·T(-c)
        tc.translate(W / 2, H / 2);
        tc.transform(vs.m.a, vs.m.b, vs.m.c, vs.m.d, vs.m.e, vs.m.f);
        tc.translate(-W / 2, -H / 2);
        const path = new Path2D();
        path.roundRect(0, 0, W, H, vs.radius);
        if (vs.m.a < 0.999) {
          // Shadow only shows when framing is scaled down: fill a shadowed base first, then clip and draw the frame
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
        // Per-shot grade: same source as the preview's #vidEl CSS filter (canvas filter, same syntax); restore resets it
        if (filterCss) tc.filter = filterCss;
        smp.draw(tc, (W - rg.dw) / 2, (H - rg.dh) / 2, rg.dw, rg.dh);
        tc.restore();
        tc.setTransform(1, 0, 0, 1, 0, 0);
      };
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, outW, outH);
      if (sample && rig) paintLayer(lctx, sample, rig, seg.filter);
      // Shadow layer: the "other side" frame within the window (true dual-stream; sample out-of-range/absent = hard-cut fallback)
      let ghostReady = false;
      if (tr) {
        gctx.setTransform(1, 0, 0, 1, 0, 0);
        gctx.clearRect(0, 0, outW, outH);
        if (gSample && gRig && gseg) {
          paintLayer(gctx, gSample, gRig, gseg.filter);
          ghostReady = true;
        }
      }
      // Composite into vidC: gl-transitions mixer (same GL_MIXER_SRC as the preview shim / panel);
      // shadow absent / GL unavailable → hard-cut fallback
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.clearRect(0, 0, outW, outH);
      let mixed = false;
      if (tr && ghostReady && mixer) {
        const p = Math.min(1, Math.max(0, (t - (tr.cut - tr.half)) / (2 * tr.half))); // 0=window start, 1=end
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
      if (pendingAdd) await pendingAdd; // Previous frame's encode backpressure: only awaited here, so the next frame is already being prepared during encoding
      pendingAdd = videoSource.add(t, 1 / FPS);
      tm.enc += performance.now() - e0;
      // Retire once done (checked once per second): sources past their last-use time drop the video decode stream; shadow sources dispose their input too
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

    // Audio track: concatenate in edited-segment order (main segment = narration audio, insert clip = its own), re-stamp timestamps
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
