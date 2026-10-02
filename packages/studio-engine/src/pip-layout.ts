import type { EditorDocumentV2, GraphicTimelineClip, MediaTimelineClip } from './editor-document';

export const PIP_TEMPLATES = [
  { id: 'smart', zh: '智能匹配', en: 'Smart fit' },
  { id: 'inset', zh: '素材小窗', en: 'Footage inset' },
  { id: 'dim', zh: '背景压暗', en: 'Dim background' },
  { id: 'split', zh: '素材在上', en: 'Footage on top' },
  { id: 'split-bottom', zh: '素材在下', en: 'Footage below' },
  { id: 'presenter', zh: '人物小窗', en: 'Presenter inset' },
  // Person-cutout layouts are no longer offered; projects that saved them still render.
  { id: 'cutout', zh: '人像出框', en: 'Foreground presenter', retired: true },
  { id: 'cutout-small', zh: '抠像小窗', en: 'Cutout inset', retired: true },
] as const;
export type PipTemplate = typeof PIP_TEMPLATES[number]['id'];
/** The layouts users can pick. */
export const PIP_PICKER_TEMPLATES = PIP_TEMPLATES.filter(template => !('retired' in template));
/** With smart fit, the planner picks one of these for each shot, so one video mixes layouts. */
export const PIP_SHOT_LAYOUTS = ['presenter', 'split', 'split-bottom', 'inset', 'dim'] as const;
export type PipShotLayout = typeof PIP_SHOT_LAYOUTS[number];
export const isPipShotLayout = (value: unknown): value is PipShotLayout => PIP_SHOT_LAYOUTS.includes(value as PipShotLayout);
export type PipCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type PipSize = 'small' | 'medium' | 'large';
export interface PipOptions {
  template: PipTemplate;
  position?: PipCorner;
  size?: PipSize;
  mediaFit?: 'contain' | 'cover';
  speakerFit?: 'contain' | 'cover';
}
export const DEFAULT_PIP_OPTIONS: PipOptions = { template: 'smart' };
export function validPipOptions(value: unknown): value is PipOptions {
  const row = value as PipOptions | null;
  return !!row && PIP_TEMPLATES.some(item => item.id === row.template)
    && (row.position === undefined || ['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(row.position))
    && (row.size === undefined || ['small', 'medium', 'large'].includes(row.size))
    && (row.mediaFit === undefined || ['contain', 'cover'].includes(row.mediaFit))
    && (row.speakerFit === undefined || ['contain', 'cover'].includes(row.speakerFit));
}
export interface PipBox { x: number; y: number; w: number; h: number }
export interface PipGeometry {
  resolvedTemplate: Exclude<PipTemplate, 'smart'>;
  media: PipBox; speaker?: PipBox; background?: string;
  mediaFit: 'contain' | 'cover'; speakerFit: 'contain' | 'cover'; speakerAnchorY: number; speakerCutout?: boolean;
}
type Dimensions = { width: number; height: number };
const aspect = (value: Dimensions) => Math.max(1, value.width) / Math.max(1, value.height);
function fittedBox(canvas: Dimensions, asset: Dimensions, region: PipBox): PipBox {
  const ratio = aspect(canvas) / aspect(asset);
  const w = Math.min(region.w, region.h / ratio); const h = w * ratio;
  return { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h };
}
/** The vertical band captions occupy, as canvas fractions (top < bottom). */
export interface CaptionBand { top: number; bottom: number }
/**
 * Where captions sit for a caption style: `yPct` is the caption group's bottom; the band above it
 * holds two lines (four with a translation line), scaled with the caption size.
 */
export function captionBandFor(style: { on?: boolean; yPct?: number; scale?: number; sub?: unknown } | undefined): CaptionBand | undefined {
  if (!style?.on || typeof style.yPct !== 'number') return undefined;
  const bottom = style.yPct / 100;
  return { top: bottom - (style.sub ? .14 : .08) * (style.scale ?? 1), bottom };
}
/** Functional templates. Insets keep their source ratio; bottom-corner insets stay clear of the caption band. */
export function pipGeometry(template: PipTemplate, canvas: Dimensions, asset: Dimensions, options: Partial<PipOptions> = {}, source: Dimensions = canvas, captions?: CaptionBand): PipGeometry {
  const portrait = canvas.height > canvas.width;
  const selected = template === 'smart'
    ? portrait && aspect(asset) >= 1.2 ? 'split' : !portrait && aspect(asset) < .8 ? 'inset' : 'presenter'
    : template;
  const size = options.size ?? 'medium'; const factor = { small: .82, medium: 1, large: 1.18 }[size];
  const inset = (dimensions: Dimensions, presenter = false): PipBox => {
    const maxW = (portrait ? presenter ? .38 : .46 : .3) * factor;
    const maxH = (portrait ? .34 : .4) * factor;
    const fitted = fittedBox(canvas, dimensions, { x: 0, y: 0, w: maxW, h: maxH });
    const corner = options.position ?? 'bottom-right';
    // A bottom-corner window ends above the captions, so lines never run across it.
    const floor = captions && captions.bottom > .4 ? Math.min(.79, captions.top - .02) : .79;
    return { ...fitted, x: corner.endsWith('left') ? .04 : .96 - fitted.w, y: corner.startsWith('top') ? .06 : Math.max(.06, floor - fitted.h) };
  };
  const common = { resolvedTemplate: selected, mediaFit: options.mediaFit ?? (['presenter', 'cutout-small', 'split', 'split-bottom'].includes(selected) ? 'cover' : 'contain'), speakerFit: options.speakerFit ?? 'contain', speakerAnchorY: .5 } as const;
  if (selected === 'cutout-small') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), speakerCutout: true, speakerFit: 'contain', background: '#171717' };
  if (selected === 'cutout') {
    const speaker = portrait ? { x: 0, y: .15, w: 1, h: .85 } : { x: .62, y: .1, w: .38, h: .9 };
    return { ...common, media: portrait ? { x: .04, y: .04, w: .92, h: .66 } : { x: .04, y: .06, w: .76, h: .86 }, speaker, speakerCutout: true, speakerFit: 'cover', background: '#171717' };
  }
  if (selected === 'presenter') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), background: '#171717' };
  if (selected === 'split' || selected === 'split-bottom') {
    // Two equal halves; the footage takes the top (left) or the bottom (right).
    const after = selected === 'split-bottom';
    return { ...common,
      media: portrait ? { x: 0, y: after ? .5 : 0, w: 1, h: .5 } : { x: after ? .5 : 0, y: 0, w: .5, h: 1 },
      speaker: portrait ? { x: 0, y: after ? 0 : .5, w: 1, h: .5 } : { x: after ? 0 : .5, y: 0, w: .5, h: 1 },
      speakerFit: options.speakerFit ?? 'cover', speakerAnchorY: source.height > source.width ? .4 : .5,
      background: '#171717',
    };
  }
  if (selected === 'dim') return { ...common, media: fittedBox(canvas, asset, { x: .06, y: .06, w: .88, h: .72 }), background: 'rgba(0,0,0,.62)' };
  return { ...common, media: inset(asset) };
}
export function resolvePipGeometry(options: PipOptions, canvas: Dimensions, asset: Dimensions, source: Dimensions = canvas, captions?: CaptionBand): PipGeometry {
  if (!validPipOptions(options)) throw new Error('画中画配置无效。');
  return pipGeometry(options.template, canvas, asset, options, source, captions);
}

/**
 * Rebuild only the layout layers tied to actual footage windows. The source audio stays intact.
 * `layouts` holds a clip's own layout (planned or chosen); other clips follow the template, and smart fit goes by shape.
 */
export function applyPipLayout(document: EditorDocumentV2, options: PipOptions, trackId = 'broll', layouts: Record<string, PipShotLayout> = {}): EditorDocumentV2 {
  const next = structuredClone(document); const footage = next.timeline.tracks.find(track => track.id === trackId);
  if (!footage) return next;
  const groundId = trackId + '-pip-ground'; const presenterId = trackId + '-pip-presenter';
  next.timeline.tracks = next.timeline.tracks.filter(track => ![groundId, presenterId].includes(track.id));
  const grounds: GraphicTimelineClip[] = []; const presenters: MediaTimelineClip[] = [];
  const primary = next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId);
  const hasCaptions = next.timeline.tracks.some(track => track.type === 'caption' && track.clips.length > 0);
  const captions = hasCaptions ? captionBandFor(next.appearance.captionStyle) : undefined;
  footage.stackOrder = 3;
  for (const clip of footage.clips) {
    if (clip.kind !== 'media') continue;
    const asset = next.assets[clip.assetId];
    const firstSource = primary?.clips.find(source => source.kind === 'narrative' && source.enabled && source.startFrame < clip.startFrame + clip.durationFrames && source.startFrame + source.durationFrames > clip.startFrame);
    const sourceAsset = firstSource && 'assetId' in firstSource && firstSource.assetId ? next.assets[firstSource.assetId] : undefined;
    const planned = layouts[clip.id];
    const geometry = resolvePipGeometry(planned ? { ...options, template: planned } : options, next.canvas, { width: asset.metadata?.width ?? next.canvas.width, height: asset.metadata?.height ?? next.canvas.height }, { width: sourceAsset?.metadata?.width ?? next.canvas.width, height: sourceAsset?.metadata?.height ?? next.canvas.height }, captions);
    clip.box = geometry.media; clip.fit = geometry.mediaFit; clip.linkGroupId = clip.id + '-pip';
    const { startFrame, durationFrames, linkGroupId } = clip;
    if (geometry.background) grounds.push({ id: clip.id + '-ground', kind: 'graphic', enabled: true, startFrame, durationFrames, linkGroupId, anchor: { type: 'timeline' }, block: { templateId: 'custom', label: '画中画背景', box: { x: 0, y: 0, w: 1, h: 1 }, slots: { innerHtml: `<div style="position:absolute;inset:0;background:${geometry.background}"></div>`, timelineBody: '', authoredDurationSec: durationFrames / next.canvas.fps } } });
    if (geometry.speaker) for (const source of primary?.clips ?? []) {
      if (source.kind !== 'narrative' || !source.enabled) continue;
      const start = Math.max(startFrame, source.startFrame); const end = Math.min(startFrame + durationFrames, source.startFrame + source.durationFrames);
      if (end <= start) continue;
      const rate = (source.sourceOutSec - source.sourceInSec) / source.durationFrames;
      presenters.push({ id: clip.id + '-presenter-' + source.id, kind: 'media', assetId: source.assetId, enabled: true, startFrame: start, durationFrames: end - start, sourceInSec: source.sourceInSec + (start - source.startFrame) * rate, sourceOutSec: source.sourceInSec + (end - source.startFrame) * rate, fit: geometry.speakerFit, anchorX: .5, anchorY: geometry.speakerAnchorY, box: geometry.speaker, linkGroupId, video: { treatment: 'full', audioMuted: true, ...(geometry.speakerCutout ? { personMatte: true } : {}) } });
    }
  }
  if (grounds.length) next.timeline.tracks.push({ id: groundId, type: 'graphics', name: '画中画背景', stackOrder: 2, hidden: false, muted: true, locked: false, syncLocked: true, clips: grounds });
  if (presenters.length) next.timeline.tracks.push({ id: presenterId, type: 'visual', name: '人物小窗', stackOrder: 4, hidden: false, muted: true, locked: false, syncLocked: true, clips: presenters });
  for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(5, track.stackOrder);
  return next;
}
