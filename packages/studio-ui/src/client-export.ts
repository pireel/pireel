/**
 * Client-side export (local compositing, the default path; server render is only a fallback).
 *
 *  Video layer (track 0, multi-source) — each source (main video File / insert-clip File|URL)
 *    gets one sequential MediaBunny sample stream; frames are drawn to canvas per edited time.
 *    Legacy framing transforms are copied from the hidden iframe; source-normalized precise framing
 *    uses the same sourceDrawRect geometry as preview before transitions are composited.
 *  Overlay layer (track ≥1) — after seekTimelines(t) on the same iframe, #root is serialized
 *    into an SVG foreignObject → <img> → drawImage; the rasterizer is Blink itself. Fonts and
 *    in-block images must be inlined as data: (foreignObject rasterization forbids any external
 *    load); the main-track <video> is hidden with !important CSS (TRIM_SHIM's applyMode rewrites
 *    inline opacity on every seek, so inline can't hold it down).
 *  Audio track — concatenated in edited-segment order: main segments take the main video's audio,
 *    insert clips take their own (matching the preview), timestamps re-stamped onto the edited timeline.
 *
 *  Known not exported: ad-hoc video elements embedded inside graphic blocks (V2 visual-track media
 *    is composited separately), the person-matte layer (canvas isn't serialized, degrades gracefully
 *    outside preview). Ported from experiments/client-export-spike (gotchas and notes all from real testing).
 */

import {
  ALL_FORMATS,
  AudioSample,
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
  WebMOutputFormat,
} from 'mediabunny';
import {
  type AudioClip,
  type Composition,
  type CompositionVisualLayer,
  type ShotFilter,
  type ShotPreciseFraming,
  type SupplementalVisualMediaClip,
  type TransitionDirection,
  type VideoShotTimelinePlacement,
  assembleHtml,
  cutTransitions,
  parseClipInset,
  segmentFadeFn,
  shotFilterCss,
  shotGain,
  shotsContiguous,
  sourceDrawRect,
  totalDuration,
  validateComposition,
  videoTrackShots,
  videoShotTimelineSpans,
} from '@pireel/studio-engine/composition';
import { decodeAudioFile } from './audio-decode';
import { mixAudioTrack } from './export-audio-mix';
import {
  activeVisualMedia,
  disposeVisualImageBitmaps,
  drawSupplementalVisualMedia,
  loadExportVideoFile,
  loadVisualImageBitmaps,
  type SampledVisualVideo,
} from './export-visual-media';
import { disposeSourceRig, openSource, sampleAt, type SourceRig } from './export-video-source';
import { createGlMixer, glDirection } from '@pireel/studio-engine/transition-gl';
import { injectPreviewRuntime } from './sample-composition';
import { buildInlineFontCss } from './export-fonts';
import { t } from './i18n';
import {
  browserVisualLayerPlan,
  personMatteCompositingActive,
  serializeBrowserOverlayElements,
} from './browser-visual-layer-plan';
import { fingerprintReviewPixels, type ReviewFrameFingerprint } from './review-similarity';
import { segmentSourceRate, segmentSourceTimeAt } from './video-segment-time';

/** Export options (chosen in the dialog): res=short-side pixels (width for portrait), fps, format=container/codec. */
export interface ExportRenderOpts {
  res: number;
  fps: number;
  format: 'mp4' | 'mov' | 'webm';
}
export const DEFAULT_RENDER_OPTS: ExportRenderOpts = { res: 1080, fps: 30, format: 'mp4' };

function assertExportableComposition(comp: Composition): void {
  const issues = validateComposition(comp);
  if (issues.length) throw new Error(`Invalid composition: ${issues.slice(0, 3).map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
}

/* ============================ Sources and segments ============================ */

interface ExpSeg {
  srcStart: number;
  srcEnd: number;
  /** Source key: 'main' or an insert-clip key (clip_<shotId>), used only as the rigs/files Map key. */
  key: string;
  timelineStart: number;
  timelineEnd: number;
  /** Per-shot color grade (CSS filter string; 'none'/absent = no grade) — same shotFilterCss as the preview's #vidEl filter. */
  filter?: string;
  /** Linear audio gain 0..1 (shotGain of the shot; absent = 1). 0 = the segment contributes no audio samples at all. */
  gain?: number;
  /** Segment-local fade factor (segmentFadeFn: shot fades × seam micro-fades); absent = flat. */
  fadeAt?: (tLocal: number) => number;
  /** Source-normalized precision is drawn before the element-level framing matrix. */
  framing?: ShotPreciseFraming;
}

/** Rewrite an audio sample's PCM through a gain ENVELOPE (interleaved f32 round-trip; format/rate/channels
 *  preserved). gainAt takes the sample-relative offset in seconds, so a shot's fades ride inside one sample
 *  buffer too. Only called when the segment isn't a plain gain-1 passthrough. */
export function scaleAudioSample(sample: AudioSample, gainAt: (offsetSec: number) => number): AudioSample {
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels);
  sample.copyTo(data, { planeIndex: 0, format: 'f32' });
  const ch = sample.numberOfChannels;
  for (let f = 0; f < sample.numberOfFrames; f++) {
    const g = gainAt(f / sample.sampleRate);
    for (let c = 0; c < ch; c++) data[f * ch + c]! *= g;
  }
  return new AudioSample({
    data,
    format: 'f32',
    numberOfChannels: sample.numberOfChannels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  });
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
          hide.textContent = '#vidEl, .hf-native-visual { opacity: 0 !important; }';
          doc.head.appendChild(hide);
          await doc.fonts.ready;
          const root = doc.getElementById('root');
          if (!root || !win.__hfPreview) throw new Error(t('common.overlayDocumentMissingRoot'));
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

function applyPrimaryOverlayVisibility(overlay: Overlay, hidden: boolean | undefined): void {
  if (!hidden) return;
  for (const id of ['vidEl', 'personCut', 'personBg']) {
    const element = overlay.doc.getElementById(id);
    if (element) element.style.visibility = 'hidden';
  }
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

function readTransform(win: Window, el: Element | null): { m: DOMMatrix; radius: number; inset: { t: number; r: number; b: number; l: number } } {
  if (!el) return { m: new DOMMatrix(), radius: 0, inset: { t: 0, r: 0, b: 0, l: 0 } };
  const cs = win.getComputedStyle(el);
  const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix();
  // clip-path carries the crop for fill-the-half splits (transform is only the park position
  // there) — reading transform alone painted the full frame shifted, cropping nothing.
  return { m, radius: parseFloat(cs.borderTopLeftRadius) || 0, inset: parseClipInset(cs.clipPath) };
}

/** The element-local rect that survives transform + clip — clip-path lives in the element's own
 *  coordinate system, so this rect is built in W×H space and clipped AFTER the matrix applies,
 *  matching CSS order. Shared by the export loop and the still-frame capture. */
function framedClipPath(W: number, H: number, vs: { radius: number; inset: { t: number; r: number; b: number; l: number } }): Path2D {
  const path = new Path2D();
  path.roundRect(W * vs.inset.l, H * vs.inset.t, W * (1 - vs.inset.l - vs.inset.r), H * (1 - vs.inset.t - vs.inset.b), vs.radius);
  return path;
}

/* ============================ Main export flow ============================ */

export interface ClientExportOpts {
  comp: Composition;
  videoPlacements?: readonly VideoShotTimelinePlacement[];
  primaryVisualHidden?: boolean;
  primaryAudioMuted?: boolean;
  visualMediaClips?: readonly SupplementalVisualMediaClip[];
  timelineDurationSec?: number;
  /** Main-source bytes. Null is valid for graphics/audio-only and clips-only documents. */
  videoFile: File | null;
  /** Local insert-clip Files (key = blob URL, same source as workbench clipFilesRef). */
  clipFiles: Map<string, File>;
  /** Audio-track clips + their bytes. Absent/empty = the untouched narration-only audio path. */
  audio?: { clip: AudioClip; file: File }[] | null;
  /** Denoise substitution: source key → baked blended audio file. That source's audio track is read
   *  from this file instead of the source video (video decode untouched) — preview's dub, verbatim. */
  denoise?: Map<string, File> | null;
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
export interface CapturedCompositionFrame {
  dataUrl: string;
  width: number;
  height: number;
  /** Local-only fingerprint of the composed frame before the harness timecode is burned in. */
  localSimilarityFingerprint?: ReviewFrameFingerprint;
}

export async function captureCompositionFrame(opts: {
  comp: Composition;
  videoPlacements?: readonly VideoShotTimelinePlacement[];
  primaryVisualHidden?: boolean;
  visualMediaClips?: readonly SupplementalVisualMediaClip[];
  timelineDurationSec?: number;
  videoFile: File | null;
  clipFiles: Map<string, File>;
  atSec: number;
  /** Output long-side pixels (default 960). */
  maxDim?: number;
  /** Burn a small dark chip with this text into the top-left corner — captured frames self-identify
   *  (the agent may hold several) and the label survives any downstream re-encoding. */
  burnLabel?: string;
  /** Compute a local visual fingerprint for paid-review deduplication. */
  localSimilarityFingerprint?: boolean;
}): Promise<CapturedCompositionFrame> {
  const { comp } = opts;
  assertExportableComposition(comp);
  const W = comp.width;
  const H = comp.height;
  const k = Math.min(1, (opts.maxDim ?? 960) / Math.max(W, H));
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  const outW = even(W * k);
  const outH = even(H * k);
  const t = Math.max(0, Math.min(opts.timelineDurationSec ?? totalDuration(comp), opts.atSec));

  // Find which edited segment t falls in (same logic as export's segAt), open only that one source
  let rig: SourceRig | null = null;
  let srcT = 0;
  let sourceFraming: ShotPreciseFraming | undefined;
  const shots = videoTrackShots(comp);
  let file: File | null = null;
  for (const sp of videoShotTimelineSpans(shots, opts.videoPlacements)) {
    if (t >= sp.editedStart - 1e-6 && t < sp.editedEnd - 1e-6) {
      const s = sp.clip as (typeof shots)[number] & { src?: string };
      srcT = segmentSourceTimeAt(s, t, sp.editedStart, sp.editedEnd);
      file = s.src ? (opts.clipFiles.get(s.src) ?? null) : opts.videoFile;
      sourceFraming = s.preciseFraming?.coordinateSpace === 'source-normalized' ? s.preciseFraming : undefined;
      break;
    }
  }
  if (file) {
    try {
      rig = await openSource(file, Math.max(0, srcT - 0.1), srcT);
    } catch {
      rig = null; // Source won't open: degrade to no video frame (overlay still visible)
    }
  }
  const activeVisuals = activeVisualMedia(opts.visualMediaClips ?? [], t);
  const visualRigs = new Map<string, { rig: SourceRig; srcT: number }>();
  const visualImages = await loadVisualImageBitmaps(activeVisuals);
  const visualFiles = new Map<string, Promise<File>>();
  for (const visual of activeVisuals) {
    if (visual.kind !== 'video') continue;
    try {
      let visualFile = visualFiles.get(visual.source);
      if (!visualFile) {
        visualFile = loadExportVideoFile(visual.source, opts.clipFiles);
        visualFiles.set(visual.source, visualFile);
      }
      const srcT = segmentSourceTimeAt(
        { srcStart: visual.sourceInSec, srcEnd: visual.sourceOutSec },
        t,
        visual.startSec,
        visual.endSec,
      );
      visualRigs.set(visual.clipId, {
        rig: await openSource(await visualFile, Math.max(visual.sourceInSec, srcT - 0.1), srcT),
        srcT,
      });
    } catch {
      // One unavailable supplemental source must not hide the rest of the composed frame.
    }
  }

  const disposeCaptureSources = () => {
    if (rig) disposeSourceRig(rig);
    for (const layer of visualRigs.values()) disposeSourceRig(layer.rig);
    disposeVisualImageBitmaps(visualImages);
  };
  let overlay: Overlay;
  try {
    overlay = await createOverlay(injectPreviewRuntime(assembleHtml(comp, undefined, opts.videoPlacements, opts.visualMediaClips)), W, H);
    applyPrimaryOverlayVisibility(overlay, opts.primaryVisualHidden);
  } catch (error) {
    disposeCaptureSources();
    throw error;
  }
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
    const visualLayers = browserVisualLayerPlan(comp, activeVisuals, opts.videoPlacements);
    const fullOverlayPass = personMatteCompositingActive(comp, opts.videoPlacements);
    const overlayImages = await Promise.all(visualLayers.flatMap((layer) => layer.kind === 'html'
      ? [rasterize(
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            svgOpen(W, H, outW, outH, css)
            + serializeBrowserOverlayElements(overlay.root, overlay.doc, fullOverlayPass ? undefined : layer.blocks)
            + SVG_CLOSE,
          ),
        )]
      : []));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bg, 0, 0);
    const sample = rig && !opts.primaryVisualHidden ? await sampleAt(rig, srcT) : null;
    if (sample && rig && !opts.primaryVisualHidden) {
      const Sx = outW / W;
      const Sy = outH / H;
      ctx.setTransform(Sx, 0, 0, Sy, 0, 0);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.transform(vs.m.a, vs.m.b, vs.m.c, vs.m.d, vs.m.e, vs.m.f);
      ctx.translate(-W / 2, -H / 2);
      ctx.clip(framedClipPath(W, H, vs));
      const rect = sourceDrawRect(rig.sw, rig.sh, W, H, sourceFraming);
      sample.draw(ctx, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const visualSamples = new Map<string, SampledVisualVideo>();
    for (const [clipId, video] of visualRigs) {
      const sample = await sampleAt(video.rig, video.srcT);
      if (sample) visualSamples.set(clipId, { sourceWidth: video.rig.sw, sourceHeight: video.rig.sh, sample });
    }
    let htmlLayerIndex = 0;
    for (const layer of visualLayers) {
      if (layer.kind === 'media') {
        drawSupplementalVisualMedia({
          ctx,
          visuals: layer.visuals,
          timelineTime: t,
          imageBitmaps: visualImages,
          videoSamples: visualSamples,
          targetWidth: W,
          targetHeight: H,
          scaleX: outW / W,
          scaleY: outH / H,
        });
      } else {
        ctx.drawImage(overlayImages[htmlLayerIndex++]!, 0, 0);
      }
    }
    let localSimilarityFingerprint: ReviewFrameFingerprint | undefined;
    if (opts.localSimilarityFingerprint) {
      try {
        const pixels = ctx.getImageData(0, 0, outW, outH);
        localSimilarityFingerprint = fingerprintReviewPixels(pixels.data, outW, outH) ?? undefined;
      } catch {
        // A tainted/unsupported canvas must never turn into a false local match: no fingerprint means
        // this frame remains distinct and is conservatively sent to the cloud reviewer.
      }
    }
    if (opts.burnLabel) {
      const fs = Math.max(14, Math.round(Math.max(outW, outH) * 0.028));
      const pad = Math.round(fs * 0.45);
      ctx.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const bw = ctx.measureText(opts.burnLabel).width + pad * 2;
      const bh = fs + pad * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.beginPath();
      ctx.roundRect(pad, pad, bw, bh, Math.round(fs * 0.25));
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.burnLabel, pad * 2, pad + bh / 2 + 0.5);
    }
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      width: outW,
      height: outH,
      ...(localSimilarityFingerprint ? { localSimilarityFingerprint } : {}),
    };
  } finally {
    disposeCaptureSources();
    overlay.dispose();
  }
}

export async function clientExportVideo(opts: ClientExportOpts): Promise<Blob> {
  const { comp, videoFile, clipFiles } = opts;
  assertExportableComposition(comp);
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
  const shots = videoTrackShots(comp);
  const durationSec = Math.max(0.5, opts.timelineDurationSec ?? totalDuration(comp));

  // Segment table (edited order) + each source's File
  const segs: ExpSeg[] = [];
  const files = new Map<string, File>();
  if (videoFile) files.set('main', videoFile);
  const spans = videoShotTimelineSpans(shots, opts.videoPlacements);
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!.clip as (typeof shots)[number] & { src?: string; filter?: ShotFilter };
    const filterCss = shotFilterCss(s.filter);
    const filter = filterCss === 'none' ? {} : { filter: filterCss };
    const g = opts.primaryAudioMuted ? 0 : shotGain(s);
    const gain = g === 1 ? {} : { gain: g };
    // Same envelope as the preview: own fades × seam micro-fades at edges that meet a non-contiguous neighbour
    const prev = spans[i - 1]?.clip as typeof s | undefined;
    const next = spans[i + 1]?.clip as typeof s | undefined;
    const fadeFn = segmentFadeFn(
      s,
      Math.max(0.01, spans[i]!.editedEnd - spans[i]!.editedStart),
      !!prev && (!shotsContiguous(prev, s) || Math.abs(spans[i - 1]!.editedEnd - spans[i]!.editedStart) > 1e-3),
      !!next && (!shotsContiguous(s, next) || Math.abs(spans[i]!.editedEnd - spans[i + 1]!.editedStart) > 1e-3),
    );
    const fade = fadeFn ? { fadeAt: fadeFn } : {};
    const framing = s.preciseFraming?.coordinateSpace === 'source-normalized' ? { framing: s.preciseFraming } : {};
    const placement = { timelineStart: spans[i]!.editedStart, timelineEnd: spans[i]!.editedEnd };
    if (!s.src) {
      segs.push({ srcStart: s.srcStart, srcEnd: s.srcEnd, key: 'main', ...placement, ...filter, ...gain, ...fade, ...framing });
      continue;
    }
    const key = `clip_${s.id}`;
    segs.push({ srcStart: s.srcStart, srcEnd: s.srcEnd, key, ...placement, ...filter, ...gain, ...fade, ...framing });
    if (!files.has(key)) {
      files.set(key, await loadExportVideoFile(s.src, clipFiles));
    }
  }
  const visualMediaClips = [...(opts.visualMediaClips ?? [])];
  const visualVideos = visualMediaClips.filter((clip) => clip.kind === 'video');
  const visualVideoKeys = new Map<string, string>();
  const visualFiles = new Map<string, Promise<File>>();
  for (const visual of visualVideos) {
    const key = `visual_${visual.trackId}_${visual.clipId}`;
    visualVideoKeys.set(visual.clipId, key);
    let visualFile = visualFiles.get(visual.source);
    if (!visualFile) {
      visualFile = loadExportVideoFile(visual.source, clipFiles);
      visualFiles.set(visual.source, visualFile);
    }
    files.set(key, await visualFile);
  }
  const visualImageBitmaps = await loadVisualImageBitmaps(visualMediaClips);

  // Per-source sequential sample stream: start = earliest time this source is used, end = latest
  const rigs = new Map<string, SourceRig>();
  const dnInputs: Input[] = [];
  let overlay: Overlay;
  try {
    for (const [key, file] of files) {
      const mine = segs.filter((s) => s.key === key);
      const visual = visualVideos.find((clip) => visualVideoKeys.get(clip.clipId) === key);
      if (!mine.length && !visual) continue;
      if (visual) {
        rigs.set(key, await openSource(file, visual.sourceInSec, visual.sourceOutSec));
        continue;
      }
      const from = Math.min(...mine.map((s) => s.srcStart));
      const to = Math.max(...mine.map((s) => s.srcEnd));
      rigs.set(key, await openSource(file, from, to));
    }

    // Denoise substitution: swap the source's audio track for the baked blend (same source seconds)
    if (opts.denoise) {
      for (const [key, f] of opts.denoise) {
        const rig = rigs.get(key);
        if (!rig) continue;
        const input = new Input({ source: new BlobSource(f), formats: ALL_FORMATS });
        const at = await input.getPrimaryAudioTrack();
        if (at) {
          rig.audio = at;
          dnInputs.push(input);
        } else void input.dispose();
      }
    }

    // Overlay document + asset inlining
    overlay = await createOverlay(injectPreviewRuntime(assembleHtml(comp, undefined, opts.videoPlacements, opts.visualMediaClips)), W, H);
    applyPrimaryOverlayVisibility(overlay, opts.primaryVisualHidden);
  } catch (error) {
    for (const rig of rigs.values()) disposeSourceRig(rig);
    for (const input of dnInputs) void input.dispose();
    disposeVisualImageBitmaps(visualImageBitmaps);
    throw error;
  }
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
    const withClips = !!opts.audio?.length;
    const needsTimelineMix = withClips || visualVideos.length > 0 || segs.some((segment) =>
      Math.abs(segmentSourceRate(segment, segment.timelineStart, segment.timelineEnd) - 1) > 1e-6,
    );
    const anyAudio = withClips
      || segs.some((s) => (s.gain ?? 1) > 0 && rigs.get(s.key)?.audio)
      || visualVideos.some((visual) => !visual.muted && rigs.get(visualVideoKeys.get(visual.clipId)!)?.audio);
    // webm container can't hold aac, so audio switches to opus for that format
    const audioSource = anyAudio ? new AudioSampleSource({ codec: render.format === 'webm' ? 'opus' : 'aac', bitrate: QUALITY_MEDIUM }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // Edited time → segment + time within source. Native gaps return the blank sentinel; they do
    // not freeze the previous frame or jump forward to the next clip.
    const segStarts = segs.map((segment) => segment.timelineStart);
    const blankSeg: ExpSeg = { srcStart: 0, srcEnd: 0, key: '__blank', timelineStart: 0, timelineEnd: 0 };
    const segAt = (te: number): { seg: ExpSeg; srcT: number } => {
      if (!segs.length) return { seg: blankSeg, srcT: 0 };
      const t = Math.max(0, te);
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!;
        const end = s.timelineEnd;
        if (t >= segStarts[i]! - 1e-6 && t < end - 1e-6) {
          return { seg: s, srcT: segmentSourceTimeAt(s, t, segStarts[i]!, end) };
        }
      }
      return { seg: blankSeg, srcT: 0 };
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
    for (const tr of opts.primaryVisualHidden ? [] : cutTransitions(shots, opts.videoPlacements)) {
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
      const rateA = segmentSourceRate(segA, segA.timelineStart, segA.timelineEnd);
      const rateB = segmentSourceRate(segB, segB.timelineStart, segB.timelineEnd);
      rigs.set(preKey, await openSource(fB, Math.max(0, segB.srcStart - tr.half * rateB), segB.srcStart + 0.2 * rateB));
      rigs.set(postKey, await openSource(fA, segA.srcEnd, segA.srcEnd + (tr.half + 0.2) * rateA));
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
      const end = segs[si]!.timelineEnd;
      lastUse.set(segs[si]!.key, Math.max(lastUse.get(segs[si]!.key) ?? 0, end));
    }
    for (const visual of visualVideos) lastUse.set(visualVideoKeys.get(visual.clipId)!, visual.endSec);
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

    // HTML tracks are rasterized as explicit passes around native media tracks. Adjacent HTML tracks
    // are coalesced by the shared layer plan, so ordinary projects still pay for one overlay bitmap.
    const visualLayers = browserVisualLayerPlan(comp, visualMediaClips, opts.videoPlacements);
    const htmlLayers = visualLayers.filter((layer): layer is Extract<CompositionVisualLayer, { kind: 'html' }> => layer.kind === 'html');
    const fullOverlayPass = personMatteCompositingActive(comp, opts.videoPlacements);
    const serializeHtmlLayers = () => htmlLayers.map((layer) => (
      serializeBrowserOverlayElements(overlay.root, overlay.doc, fullOverlayPass ? undefined : layer.blocks)
    ));

    const total = Math.max(1, Math.round(durationSec * FPS));
    // Overlay frame cache: during tween gaps / static caption periods the serialized string is identical
    // frame to frame → reuse the previous frame's bitmap, skipping parse and rasterization of the whole
    // data URI (with inlined fonts, MB-scale — the bulk of export time).
    const lastSerials = htmlLayers.map(() => '');
    const lastOverlayImages = htmlLayers.map<HTMLImageElement | null>(() => null);
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
      const serials = serializeHtmlLayers();
      tm.prep += performance.now() - tPrep;
      const overlayP = Promise.all(serials.map((serial, index) => {
        const hot = serial !== lastSerials[index] || !lastOverlayImages[index];
        if (!hot) return Promise.resolve(lastOverlayImages[index]!);
        tm.rasterN++;
        const s0 = performance.now();
        return rasterize(preEnc + encodeURIComponent(serial) + postEnc)
          .then((img) => ((tm.raster += performance.now() - s0), img));
      }));

      const tr = trsX.find((x) => t >= x.cut - x.half && t <= x.cut + x.half) ?? null;
      // Compute shadow sampling params first; the three decodes (overlay/current frame/shadow frame) are independent → parallel
      const pre = tr ? t < tr.cut : false;
      const gseg = tr ? (pre ? tr.segB : tr.segA) : null;
      const gRig = tr ? rigs.get(pre ? tr.preKey : tr.postKey) : undefined;
      const gRate = gseg ? segmentSourceRate(gseg, gseg.timelineStart, gseg.timelineEnd) : 1;
      const gSrcT = tr && gseg
        ? (pre ? Math.max(0, gseg.srcStart - (tr.cut - t) * gRate) : gseg.srcEnd + (t - tr.cut) * gRate)
        : 0;
      const visualSamplesP = Promise.all(visualVideos.map(async (visual) => {
        if (t < visual.startSec - 1e-6 || t >= visual.endSec - 1e-6) return null;
        const key = visualVideoKeys.get(visual.clipId)!;
        const visualRig = rigs.get(key);
        if (!visualRig) return null;
        const segment = { srcStart: visual.sourceInSec, srcEnd: visual.sourceOutSec };
        const visualSrcT = segmentSourceTimeAt(segment, t, visual.startSec, visual.endSec);
        const visualSample = await sampleAt(visualRig, visualSrcT);
        return visualSample ? {
          clipId: visual.clipId,
          sourceWidth: visualRig.sw,
          sourceHeight: visualRig.sh,
          sample: visualSample,
        } : null;
      }));
      const v0 = performance.now();
      const [overlayImages, sample, gSample, visualSamples] = await Promise.all([
        overlayP,
        rig && !opts.primaryVisualHidden ? sampleAt(rig, srcT).then((s) => ((tm.video += performance.now() - v0), s)) : null,
        gRig ? sampleAt(gRig, gSrcT) : null,
        visualSamplesP,
      ]);
      for (let layerIndex = 0; layerIndex < serials.length; layerIndex++) {
        lastSerials[layerIndex] = serials[layerIndex]!;
        lastOverlayImages[layerIndex] = overlayImages[layerIndex]!;
      }
      // bg / overlay are already rasterized at output resolution (outW×outH) → draw 1:1 with identity
      // transform (crisp text/graphics at 4K). The source video is still drawn in comp coordinates;
      // setTransform(Sx) maps the target rect to output size, drawImage scales straight from native frames.
      // Single-side video layer paint pipeline (shared by live and ghost): framing transform + rounded-corner clip + shadow + per-shot grade
      const paintLayer = (
        tc: OffscreenCanvasRenderingContext2D,
        smp: { draw: (c2: OffscreenCanvasRenderingContext2D, x: number, y: number, w2: number, h2: number) => void },
        rg: SourceRig,
        layerSeg: ExpSeg,
        filterCss?: string,
      ) => {
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.clearRect(0, 0, outW, outH);
        tc.setTransform(Sx, 0, 0, Sy, 0, 0);
        tc.save();
        // transform-origin: center — the computed matrix excludes origin, so sandwich it manually as T(c)·M·T(-c)
        tc.translate(W / 2, H / 2);
        tc.transform(vs.m.a, vs.m.b, vs.m.c, vs.m.d, vs.m.e, vs.m.f);
        tc.translate(-W / 2, -H / 2);
        const path = framedClipPath(W, H, vs);
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
        const rect = sourceDrawRect(rg.sw, rg.sh, W, H, layerSeg.framing);
        smp.draw(tc, rect.x, rect.y, rect.width, rect.height);
        tc.restore();
        tc.setTransform(1, 0, 0, 1, 0, 0);
      };
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, outW, outH);
      if (sample && rig) paintLayer(lctx, sample, rig, seg, seg.filter);
      // Shadow layer: the "other side" frame within the window (true dual-stream; sample out-of-range/absent = hard-cut fallback)
      let ghostReady = false;
      if (tr) {
        gctx.setTransform(1, 0, 0, 1, 0, 0);
        gctx.clearRect(0, 0, outW, outH);
        if (gSample && gRig && gseg) {
          paintLayer(gctx, gSample, gRig, gseg, gseg.filter);
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
      const videoLayers = new Map<string, SampledVisualVideo>();
      for (const layer of visualSamples) {
        if (!layer) continue;
        videoLayers.set(layer.clipId, layer);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const d0 = performance.now();
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(vidC, 0, 0);
      let htmlLayerIndex = 0;
      for (const layer of visualLayers) {
        if (layer.kind === 'media') {
          drawSupplementalVisualMedia({
            ctx,
            visuals: layer.visuals,
            timelineTime: t,
            imageBitmaps: visualImageBitmaps,
            videoSamples: videoLayers,
            targetWidth: W,
            targetHeight: H,
            scaleX: Sx,
            scaleY: Sy,
          });
        } else {
          ctx.drawImage(overlayImages[htmlLayerIndex++]!, 0, 0);
        }
      }
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
        `[export] ${total} frames/${durationSec.toFixed(1)}s → ${wall.toFixed(1)}s (${(durationSec / wall).toFixed(2)}x) · ` +
          `raster ${pct(tm.raster)} (hot passes ${tm.rasterN}) · fetch ${pct(tm.video)} · layout ${pct(tm.prep)} · draw ${pct(tm.draw)} · encoder wait ${pct(tm.enc)}`,
      );
    }

    // Audio track. Audio clips or a non-1× native placement use the 48k timeline mixer; exact 1×
    // narration without lane clips keeps the cheaper timestamp-only passthrough.
    // Per-shot volume: gain 1 passes samples through untouched (byte-identical to before the feature existed); gain 0 contributes
    // nothing (a timestamp gap decodes as silence, same as a source without audio); anything between rewrites PCM (same shotGain as preview).
    if (audioSource && needsTimelineMix) {
      const audioTracks = new Map<string, NonNullable<SourceRig['audio']>>();
      for (const [key, r] of rigs) if (r.audio && !key.startsWith('g_')) audioTracks.set(key, r.audio);
      const clips: { clip: AudioClip; buffer: AudioBuffer }[] = [];
      for (const a of opts.audio ?? []) clips.push({ clip: a.clip, buffer: await decodeAudioFile(a.file) });
      const supplementalAudioSegs = visualVideos.map((visual) => ({
        srcStart: visual.sourceInSec,
        srcEnd: visual.sourceOutSec,
        key: visualVideoKeys.get(visual.clipId)!,
        timelineStart: visual.startSec,
        timelineEnd: visual.endSec,
        gain: visual.muted ? 0 : 1,
      }));
      await mixAudioTrack({
        segs: [
          ...segs.map((s) => ({
            srcStart: s.srcStart,
            srcEnd: s.srcEnd,
            key: s.key,
            timelineStart: s.timelineStart,
            timelineEnd: s.timelineEnd,
            gain: s.gain ?? 1,
            fadeAt: s.fadeAt,
          })),
          ...supplementalAudioSegs,
        ],
        audioTracks,
        clips,
        totalSec: durationSec,
        push: (sample) => audioSource.add(sample).then(() => sample.close()),
      });
    } else if (audioSource) {
      for (const s of segs) {
        const rig = rigs.get(s.key);
        const gain = s.gain ?? 1;
        if (rig?.audio && gain > 0) {
          const asink = new AudioSampleSink(rig.audio);
          const flat = gain === 1 && !s.fadeAt;
          for await (const sample of asink.samples(s.srcStart, s.srcEnd)) {
            const base = sample.timestamp - s.srcStart; // segment-local seconds at this buffer's start
            const out = flat ? sample : scaleAudioSample(sample, (off) => gain * (s.fadeAt ? s.fadeAt(base + off) : 1));
            out.setTimestamp(Math.max(0, s.timelineStart + (sample.timestamp - s.srcStart)));
            await audioSource.add(out);
            if (out !== sample) out.close();
            sample.close();
          }
        }
      }
    }

    await output.finalize();
    const buf = (output.target as BufferTarget).buffer!;
    return new Blob([buf], { type: render.format === 'webm' ? 'video/webm' : render.format === 'mov' ? 'video/quicktime' : 'video/mp4' });
  } finally {
    for (const rig of rigs.values()) disposeSourceRig(rig);
    for (const input of dnInputs) void input.dispose();
    disposeVisualImageBitmaps(visualImageBitmaps);
    overlay.dispose();
  }
}
