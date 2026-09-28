import type { EditorDocumentV2, GraphicTimelineClip, MediaTimelineClip } from './editor-document';

export const PIP_TEMPLATES = [
  { id: 'smart', zh: '智能匹配', en: 'Smart fit' },
  { id: 'inset', zh: '素材小窗', en: 'Footage inset' },
  { id: 'dim', zh: '背景压暗', en: 'Dim background' },
  { id: 'split', zh: '双画面分屏', en: 'Split screen' },
  { id: 'cutout', zh: '人像出框', en: 'Foreground presenter' },
  { id: 'cutout-small', zh: '抠像小窗', en: 'Cutout inset' },
  { id: 'presenter', zh: '人物小窗', en: 'Presenter inset' },
] as const;
export type PipTemplate = typeof PIP_TEMPLATES[number]['id'];
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
/** Functional templates. Insets keep their source ratio and leave the lower caption band free. */
export function pipGeometry(template: PipTemplate, canvas: Dimensions, asset: Dimensions, options: Partial<PipOptions> = {}, source: Dimensions = canvas): PipGeometry {
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
    return { ...fitted, x: corner.endsWith('left') ? .04 : .96 - fitted.w, y: corner.startsWith('top') ? .06 : .79 - fitted.h };
  };
  const common = { resolvedTemplate: selected, mediaFit: options.mediaFit ?? (['presenter', 'cutout-small'].includes(selected) ? 'cover' : 'contain'), speakerFit: options.speakerFit ?? 'contain', speakerAnchorY: .5 } as const;
  if (selected === 'cutout-small') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), speakerCutout: true, speakerFit: 'contain', background: '#171717' };
  if (selected === 'cutout') {
    const speaker = portrait ? { x: 0, y: .15, w: 1, h: .85 } : { x: .62, y: .1, w: .38, h: .9 };
    return { ...common, media: portrait ? { x: .04, y: .04, w: .92, h: .66 } : { x: .04, y: .06, w: .76, h: .86 }, speaker, speakerCutout: true, speakerFit: 'cover', background: '#171717' };
  }
  if (selected === 'presenter') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), background: '#171717' };
  if (selected === 'split') {
    const mediaH = Math.max(.32, Math.min(.58, aspect(canvas) / aspect(asset)));
    const mediaW = Math.max(.52, Math.min(.7, aspect(asset) / aspect(canvas)));
    return { ...common,
      media: portrait ? { x: 0, y: 0, w: 1, h: mediaH } : { x: 0, y: 0, w: mediaW, h: 1 },
      speaker: portrait ? { x: 0, y: mediaH, w: 1, h: 1 - mediaH } : { x: mediaW, y: 0, w: 1 - mediaW, h: 1 },
      speakerFit: options.speakerFit ?? 'cover', speakerAnchorY: source.height > source.width ? .4 : .5,
      background: '#171717',
    };
  }
  if (selected === 'dim') return { ...common, media: fittedBox(canvas, asset, { x: .06, y: .06, w: .88, h: .72 }), background: 'rgba(0,0,0,.62)' };
  return { ...common, media: inset(asset) };
}
export function resolvePipGeometry(options: PipOptions, canvas: Dimensions, asset: Dimensions, source: Dimensions = canvas): PipGeometry {
  if (!validPipOptions(options)) throw new Error('画中画配置无效。');
  return pipGeometry(options.template, canvas, asset, options, source);
}

/** Rebuild only the layout layers tied to actual footage windows. The source audio stays intact. */
export function applyPipLayout(document: EditorDocumentV2, options: PipOptions, trackId = 'broll'): EditorDocumentV2 {
  const next = structuredClone(document); const footage = next.timeline.tracks.find(track => track.id === trackId);
  if (!footage) return next;
  const groundId = trackId + '-pip-ground'; const presenterId = trackId + '-pip-presenter';
  next.timeline.tracks = next.timeline.tracks.filter(track => ![groundId, presenterId].includes(track.id));
  const grounds: GraphicTimelineClip[] = []; const presenters: MediaTimelineClip[] = [];
  const primary = next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId);
  footage.stackOrder = 3;
  for (const clip of footage.clips) {
    if (clip.kind !== 'media') continue;
    const asset = next.assets[clip.assetId];
    const firstSource = primary?.clips.find(source => source.kind === 'narrative' && source.enabled && source.startFrame < clip.startFrame + clip.durationFrames && source.startFrame + source.durationFrames > clip.startFrame);
    const sourceAsset = firstSource && 'assetId' in firstSource && firstSource.assetId ? next.assets[firstSource.assetId] : undefined;
    const geometry = resolvePipGeometry(options, next.canvas, { width: asset.metadata?.width ?? next.canvas.width, height: asset.metadata?.height ?? next.canvas.height }, { width: sourceAsset?.metadata?.width ?? next.canvas.width, height: sourceAsset?.metadata?.height ?? next.canvas.height });
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
