/**
 * The browser half of the look checks: render the pieces and the placed graphics for real, then
 *  - refuse a look whose pieces break the words contract (look-contract.ts), and
 *  - fit placed graphics to the picture by program (graphic-fit.ts): readable text, clear of the
 *    speaker's face and the captions, wholly inside their box — without regenerating anything.
 */

import type { Block, Composition, NormBox, SupplementalVisualMediaClip, VideoShot, VideoShotTimelinePlacement } from '@pireel/studio-engine/composition';
import { resolveShotMediaFraming, sourceDrawRect, videoShotTimelineSpans, videoTrackShots } from '@pireel/studio-engine/composition';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import { documentCaptionsOn } from '@pireel/studio-engine/editor-document/caption-state';
import { captionBandRects } from '@pireel/studio-engine/facts';
import { fitGraphic, headRectFromFace, mediaWindowBox, type GraphicObstacle, type PxRect } from '@pireel/studio-engine/graphic-fit';
import { LOOK_TEMPLATE_PREFIX, lookHeadHtml, type DocumentLook, type LookIssue } from '@pireel/studio-engine/look';
import { lookPieceContractIssues, lookPieceProbes, type LookProbeRender } from '@pireel/studio-engine/look-contract';
import { measureOverlayBlocks } from './client-export';
import { analyzeGeometryRange } from './geometry';
import { probeVideoFile } from './media';
import { segmentSourceTimeAt } from './video-segment-time';

/** When a component's entrance has played out: a couple of seconds in (retimed by its own motion
 *  speed and delay), never past its last frame. */
export function componentSettledAtSec(block: Pick<Block, 'startSec' | 'durationSec' | 'motion'>): number {
  const speed = block.motion?.speed && block.motion.speed > 0 ? block.motion.speed : 1;
  const settle = (block.motion?.delaySec ?? 0) + 2.2 / speed;
  const last = Math.max(0, block.durationSec - 0.05);
  return Math.round((block.startSec + Math.min(settle, last * 0.9)) * 100) / 100;
}

/* ---------------------------------- words contract ---------------------------------- */

/** A timeline stand-in for running piece code outside GSAP: every call chains, numbers read as 0. */
function inertTimeline(): unknown {
  const target = function inert() { /* chain */ };
  const proxy: unknown = new Proxy(target, {
    get: (_target, key) => {
      if (key === Symbol.toPrimitive || key === 'valueOf') return () => 0;
      if (key === 'toString') return () => '';
      if (key === 'then') return undefined;
      return proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

function loadFrame(html: string, width: number, height: number): Promise<HTMLIFrameElement> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `position:absolute;left:-200vw;top:0;width:${width}px;height:${height}px;border:0;`;
    iframe.srcdoc = html;
    iframe.addEventListener('load', () => resolve(iframe), { once: true });
    document.body.appendChild(iframe);
  });
}

/** Render every piece with marker props and read what it shows. Hard issues refuse the look. */
export async function checkLookPieces(look: DocumentLook, canvas: { width: number; height: number }): Promise<{ hard: LookIssue[]; soft: LookIssue[] }> {
  const probes = lookPieceProbes(look);
  const w = Math.round(canvas.width * 0.88);
  const h = Math.round(canvas.height * 0.3);
  const hosts = probes.flatMap((probe) => Object.keys(probe.variants).map((variant) =>
    `<div class="look-piece" data-probe="${probe.pieceId}|${variant}" style="position:relative;width:${w}px;height:${h}px;overflow:hidden"></div>`)).join('');
  const iframe = await loadFrame(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style>${lookHeadHtml(look)}</head><body>${hosts}</body></html>`, canvas.width, canvas.height);
  const hard: LookIssue[] = [];
  const soft: LookIssue[] = [];
  try {
    const win = iframe.contentWindow as (Window & { __look?: { pieces: Record<string, (props: unknown, ctx: unknown) => { html?: string; animate?: (tl: unknown, el: Element, ctx: unknown) => void } | undefined> } }) | null;
    const doc = iframe.contentDocument;
    if (!win || !doc) return { hard, soft };
    for (const probe of probes) {
      const make = win.__look?.pieces[probe.pieceId];
      const renders: Record<string, LookProbeRender> = {};
      for (const [variant, props] of Object.entries(probe.variants)) {
        const el = doc.querySelector(`[data-probe="${probe.pieceId}|${variant}"]`) as HTMLElement | null;
        if (!el) continue;
        if (!make) { renders[variant] = { error: 'the source did not compile' }; continue; }
        const ctx = { width: w, height: h, duration: 4, words: [] };
        try {
          const built = make(props, ctx) ?? {};
          el.innerHTML = built.html ?? '';
          try { built.animate?.(inertTimeline(), el, ctx); } catch { /* motion is not the words contract */ }
          renders[variant] = { text: el.innerText ?? '' };
        } catch (error) {
          renders[variant] = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      const issues = lookPieceContractIssues(probe, renders);
      hard.push(...issues.hard);
      soft.push(...issues.soft);
    }
  } finally {
    iframe.remove();
  }
  return { hard, soft };
}

/* ---------------------------------- placement fit ---------------------------------- */

export interface LookFitDeps {
  document: () => EditorDocumentV2;
  renderTimeline: () => {
    composition: Composition;
    placements?: readonly VideoShotTimelinePlacement[];
    visualMediaClips?: readonly SupplementalVisualMediaClip[];
  };
  videoFile: File | null;
  clipFiles: Map<string, File>;
  /** Apply geometry patches to graphic clips; false when the edit was refused. */
  patch: (updates: { clipId: string; block: Partial<Block> }[]) => boolean;
}

export interface LookFitReport {
  clipId: string;
  changes: string[];
  unresolved: string[];
}

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const dimsCache = new Map<string, Promise<{ width: number; height: number } | null>>();
const facesCache = new Map<string, Promise<PxRect[]>>();

function sourceDims(file: File) {
  const key = fileKey(file);
  let hit = dimsCache.get(key);
  if (!hit) {
    hit = probeVideoFile(file).then((probe) => (probe.width && probe.height ? { width: probe.width, height: probe.height } : null)).catch(() => null);
    dimsCache.set(key, hit);
  }
  return hit;
}

/** Faces in [fromSec, toSec] of a source, normalized to its frame. */
function sourceFaces(file: File, fromSec: number, toSec: number): Promise<PxRect[]> {
  const samples = Math.max(2, Math.min(4, Math.round((toSec - fromSec) / 2)));
  const key = `${fileKey(file)}:${fromSec.toFixed(2)}:${toSec.toFixed(2)}:${samples}`;
  let hit = facesCache.get(key);
  if (!hit) {
    hit = analyzeGeometryRange(file, fromSec, toSec, samples)
      .then((frames) => (frames ?? []).flatMap((frame) => (frame.face ? [frame.face] : [])))
      .catch(() => []);
    facesCache.set(key, hit);
  }
  return hit;
}

/** What of the speaker a graphic must stay off over a stretch of the timeline, in canvas px: the
 *  head of a frame-filling speaker (one rect per sampled moment), or the whole window of a shrunk
 *  or split one. */
async function speakerDuring(
  comp: Composition,
  placements: readonly VideoShotTimelinePlacement[] | undefined,
  deps: Pick<LookFitDeps, 'videoFile' | 'clipFiles'>,
  startSec: number,
  endSec: number,
): Promise<GraphicObstacle[]> {
  const W = comp.width;
  const H = comp.height;
  const out: GraphicObstacle[] = [];
  for (const span of videoShotTimelineSpans(videoTrackShots(comp), placements)) {
    const from = Math.max(startSec, span.editedStart);
    const to = Math.min(endSec, span.editedEnd);
    if (to - from < 0.05) continue;
    const shot = span.clip as VideoShot;
    // A shrunk or split speaker sits in its own window: the window is the obstacle (a chart moved
    // off the captions used to land on a corner speaker).
    if (shot.treatment !== 'full' && shot.treatment !== 'punch-in') {
      const window = mediaWindowBox(resolveShotMediaFraming(shot));
      if (window.w > 0 && window.h > 0 && window.w * window.h < 0.95) out.push({ x: window.x * W, y: window.y * H, w: window.w * W, h: window.h * H, kind: 'speaker' });
      continue;
    }
    const file = shot.src ? deps.clipFiles.get(shot.src) ?? null : deps.videoFile;
    if (!file) continue;
    const dims = await sourceDims(file);
    if (!dims) continue;
    const srcFrom = segmentSourceTimeAt(shot, from, span.editedStart, span.editedEnd);
    const srcTo = segmentSourceTimeAt(shot, to, span.editedStart, span.editedEnd);
    const draw = sourceDrawRect(dims.width, dims.height, W, H, shot.preciseFraming);
    const layer = shot.mediaFraming?.transform ?? { scale: 1, offsetX: 0, offsetY: 0 };
    const mapX = (x: number) => W / 2 + (draw.x + x * draw.width - W / 2) * layer.scale + layer.offsetX * W;
    const mapY = (y: number) => H / 2 + (draw.y + y * draw.height - H / 2) * layer.scale + layer.offsetY * H;
    for (const face of await sourceFaces(file, srcFrom, srcTo)) {
      const x = mapX(face.x);
      const y = mapY(face.y);
      out.push({ ...headRectFromFace({ x, y, w: mapX(face.x + face.w) - x, h: mapY(face.y + face.h) - y }), kind: 'face' });
    }
  }
  return out;
}

type LookClip = { id: string; startSec: number; durationSec: number; block: Block };

/** Where a graphic's ink lands after a fit: the same similarity transform its layout went through. */
function movedInk(ink: PxRect, block: Block, next: { box: NormBox; contentBox: NormBox; scale: number }, W: number, H: number): PxRect {
  const layout = block.contentBox ?? block.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const s0 = (block.scale ?? 1) * (block.fitScale && block.fitScale < 0.999 ? block.fitScale : 1);
  const k = next.scale / s0;
  const from = { x: (layout.x + layout.w / 2) * W, y: (layout.y + layout.h / 2) * H };
  const to = { x: (next.contentBox.x + next.contentBox.w / 2) * W, y: (next.contentBox.y + next.contentBox.h / 2) * H };
  return { x: to.x + (ink.x - from.x) * k, y: to.y + (ink.y - from.y) * k, w: ink.w * k, h: ink.h * k };
}

/** Every look graphic and graphic block on screen with the targets, with its ink (measured once). */
async function measureOthers(
  deps: LookFitDeps,
  timeline: ReturnType<LookFitDeps['renderTimeline']>,
  targets: readonly LookClip[],
  measured: Record<string, { ink: PxRect | null }>,
): Promise<Array<{ id: string; startSec: number; durationSec: number; ink: PxRect | null }>> {
  const document = deps.document();
  const fps = document.canvas.fps;
  const all = document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => (
    clip.kind === 'graphic' && clip.enabled ? [{ id: clip.id, startSec: clip.startFrame / fps, durationSec: clip.durationFrames / fps, block: clip.block }] : []
  ))).filter((clip) => targets.some((target) => target.id !== clip.id && clip.startSec < target.startSec + target.durationSec && target.startSec < clip.startSec + clip.durationSec));
  const missing = all.filter((clip) => !measured[clip.id]);
  const extra = missing.length
    ? await measureOverlayBlocks({
      comp: timeline.composition,
      videoPlacements: timeline.placements,
      visualMediaClips: timeline.visualMediaClips,
      probes: missing.map((clip) => ({ blockId: clip.id, atSec: componentSettledAtSec({ startSec: clip.startSec, durationSec: clip.durationSec, motion: clip.block.motion }) })),
    })
    : {};
  return all.map((clip) => ({ id: clip.id, startSec: clip.startSec, durationSec: clip.durationSec, ink: (measured[clip.id] ?? extra[clip.id])?.ink ?? null }));
}

function lookClips(document: EditorDocumentV2, only?: ReadonlySet<string>): LookClip[] {
  const fps = document.canvas.fps;
  return document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    if (clip.kind !== 'graphic' || !clip.enabled || !clip.block.templateId.startsWith(LOOK_TEMPLATE_PREFIX)) return [];
    if (only && !only.has(clip.id)) return [];
    const startSec = clip.startFrame / fps;
    const durationSec = clip.durationFrames / fps;
    return [{ id: clip.id, startSec, durationSec, block: { ...clip.block, id: clip.id, startSec, durationSec, trackIndex: 0 } as Block }];
  }));
}

/**
 * Measure the look graphics (all of them, or the ids given) and fix by program what moving and
 * scaling can fix. Two rounds: a piece may reflow at its new size, so the result is measured again.
 */
export async function fitLookInstances(deps: LookFitDeps, clipIds?: readonly string[]): Promise<LookFitReport[]> {
  const only = clipIds ? new Set(clipIds) : undefined;
  const reports = new Map<string, LookFitReport>();
  let targets = lookClips(deps.document(), only);
  for (let round = 0; round < 2 && targets.length; round++) {
    const document = deps.document();
    const timeline = deps.renderTimeline();
    const comp = timeline.composition;
    const measured = await measureOverlayBlocks({
      comp,
      videoPlacements: timeline.placements,
      visualMediaClips: timeline.visualMediaClips,
      probes: targets.map((clip) => ({ blockId: clip.id, atSec: componentSettledAtSec(clip.block) })),
    });
    const captions: GraphicObstacle[] = [];
    if (documentCaptionsOn(document)) {
      const band = captionBandRects(comp, { lines: 2, withTranslation: !!comp.captionStyle?.sub });
      captions.push({ ...band.main, kind: 'captions' });
      if (band.translation) captions.push({ ...band.translation, kind: 'captions' });
    }
    const updates: { clipId: string; block: Partial<Block> }[] = [];
    // Graphics on screen at the same time keep clear of each other: each one fitted here is checked
    // against where the others are (moved ones at their new place).
    const others = await measureOthers(deps, timeline, targets, measured);
    const placed = new Map<string, PxRect>();
    for (const clip of targets) {
      const measure = measured[clip.id];
      if (!measure) continue;
      const speaker = await speakerDuring(comp, timeline.placements, deps, clip.startSec, clip.startSec + clip.durationSec);
      const neighbours = others
        .filter((other) => other.id !== clip.id && other.startSec < clip.startSec + clip.durationSec && clip.startSec < other.startSec + other.durationSec)
        .flatMap((other) => { const ink = placed.get(other.id) ?? other.ink; return ink ? [{ ...ink, kind: 'graphic' as const }] : []; });
      const fit = fitGraphic({
        canvas: { width: comp.width, height: comp.height },
        geometry: { box: clip.block.box ?? { x: 0, y: 0, w: 1, h: 1 }, contentBox: clip.block.contentBox, scale: clip.block.scale, fitScale: clip.block.fitScale },
        measure,
        obstacles: [...speaker, ...captions, ...neighbours],
        grow: round === 0,
      });
      if (fit.geometry && measure.ink) placed.set(clip.id, movedInk(measure.ink, clip.block, fit.geometry, comp.width, comp.height));
      const report = reports.get(clip.id) ?? { clipId: clip.id, changes: [], unresolved: [] };
      report.changes.push(...fit.changes);
      report.unresolved = fit.unresolved;
      reports.set(clip.id, report);
      if (fit.geometry) updates.push({ clipId: clip.id, block: { ...fit.geometry, fitScale: undefined } });
    }
    if (!updates.length || !deps.patch(updates)) break;
    const changed = new Set(updates.map((update) => update.clipId));
    targets = lookClips(deps.document(), changed);
  }
  return [...reports.values()].filter((report) => report.changes.length || report.unresolved.length);
}
