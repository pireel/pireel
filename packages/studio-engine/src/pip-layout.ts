import type { EditorDocumentV2, GraphicTimelineClip, MediaTimelineClip } from './editor-document';
import { t } from './i18n';

export const PIP_TEMPLATES = [
  { id: 'smart' },
  { id: 'inset' },
  { id: 'dim' },
  { id: 'split' },
  { id: 'split-bottom' },
  { id: 'presenter' },
  // A shot's layout only (smart fit or a timeline choice), never a whole-video template: the footage fills the frame.
  { id: 'full', shotOnly: true },
  // Person-cutout layouts are no longer offered; projects that saved them still render.
  { id: 'cutout', retired: true },
  { id: 'cutout-small', retired: true },
] as const;
/** A layout's catalog key (`engine.pipTemplate.<id>`); split layouts add `<key>Side` for a landscape canvas. */
export const pipTemplateKey = (id: string) => `engine.pipTemplate.${id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`;
export type PipTemplate = typeof PIP_TEMPLATES[number]['id'];
/** The layouts users can pick. */
export const PIP_PICKER_TEMPLATES = PIP_TEMPLATES.filter(template => !('retired' in template) && !('shotOnly' in template));
/** With smart fit, the planner picks one of these for each shot, so one video mixes layouts. */
export const PIP_SHOT_LAYOUTS = ['full', 'presenter', 'split', 'split-bottom', 'inset', 'dim'] as const;
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
  /** The point of the speaker's video kept at the centre of a cropped speaker box (split halves), 0..1. */
  speakerFocus?: { x: number; y: number };
}
export const DEFAULT_PIP_OPTIONS: PipOptions = { template: 'smart' };
export function validPipOptions(value: unknown): value is PipOptions {
  const row = value as PipOptions | null;
  return !!row && PIP_TEMPLATES.some(item => item.id === row.template)
    && (row.position === undefined || ['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(row.position))
    && (row.size === undefined || ['small', 'medium', 'large'].includes(row.size))
    && (row.mediaFit === undefined || ['contain', 'cover'].includes(row.mediaFit))
    && (row.speakerFit === undefined || ['contain', 'cover'].includes(row.speakerFit))
    && (row.speakerFocus === undefined || [row.speakerFocus?.x, row.speakerFocus?.y].every(value => typeof value === 'number' && value >= 0 && value <= 1));
}
export interface PipBox { x: number; y: number; w: number; h: number }
export interface PipGeometry {
  resolvedTemplate: Exclude<PipTemplate, 'smart'>;
  media: PipBox; speaker?: PipBox; background?: string;
  mediaFit: 'contain' | 'cover'; speakerFit: 'contain' | 'cover'; speakerAnchorX: number; speakerAnchorY: number; speakerCutout?: boolean;
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
  const common = { resolvedTemplate: selected, mediaFit: options.mediaFit ?? (['full', 'presenter', 'cutout-small', 'split', 'split-bottom'].includes(selected) ? 'cover' : 'contain'), speakerFit: options.speakerFit ?? 'contain', speakerAnchorX: options.speakerFocus?.x ?? .5, speakerAnchorY: options.speakerFocus?.y ?? .5 } as const;
  if (selected === 'cutout-small') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), speakerCutout: true, speakerFit: 'contain', background: '#171717' };
  if (selected === 'cutout') {
    const speaker = portrait ? { x: 0, y: .15, w: 1, h: .85 } : { x: .62, y: .1, w: .38, h: .9 };
    return { ...common, media: portrait ? { x: .04, y: .04, w: .92, h: .66 } : { x: .04, y: .06, w: .76, h: .86 }, speaker, speakerCutout: true, speakerFit: 'cover', background: '#171717' };
  }
  if (selected === 'full') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 } };
  if (selected === 'presenter') return { ...common, media: { x: 0, y: 0, w: 1, h: 1 }, speaker: inset(source, true), background: '#171717' };
  if (selected === 'split' || selected === 'split-bottom') {
    // Two equal halves; the footage takes the top (left) or the bottom (right).
    const after = selected === 'split-bottom';
    return { ...common,
      media: portrait ? { x: 0, y: after ? .5 : 0, w: 1, h: .5 } : { x: after ? .5 : 0, y: 0, w: .5, h: 1 },
      speaker: portrait ? { x: 0, y: after ? 0 : .5, w: 1, h: .5 } : { x: after ? 0 : .5, y: 0, w: .5, h: 1 },
      speakerFit: options.speakerFit ?? 'cover', speakerAnchorY: options.speakerFocus?.y ?? (source.height > source.width ? .4 : .5),
      background: '#171717',
    };
  }
  if (selected === 'dim') return { ...common, media: fittedBox(canvas, asset, { x: .06, y: .06, w: .88, h: .72 }), background: 'rgba(0,0,0,.62)' };
  return { ...common, media: inset(asset) };
}
/** Whether the speaker is cropped to its box, so the creator can choose which part stays in view. */
export const pipSpeakerCropped = (geometry: PipGeometry) => !!geometry.speaker && geometry.speakerFit === 'cover' && !geometry.speakerCutout;
export function resolvePipGeometry(options: PipOptions, canvas: Dimensions, asset: Dimensions, source: Dimensions = canvas, captions?: CaptionBand): PipGeometry {
  if (!validPipOptions(options)) throw new Error(t('engine.pip.invalid'));
  return pipGeometry(options.template, canvas, asset, options, source, captions);
}

/** How long a layout takes to come in and to go, in seconds. */
export const PIP_TRANSITION_SEC = .35;
type BoxRow = PipBox & { frame: number };
type ValueRow = { frame: number; value: number };
const mixBox = (from: PipBox, to: PipBox, progress: number): PipBox => ({ x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, w: from.w + (to.w - from.w) * progress, h: from.h + (to.h - from.h) * progress });
/** An eased move over `frames` from frame `at`: three rows, the middle one three quarters of the way, approximate ease-out. */
function eased<T>(from: T, to: T, at: number, frames: number, mix: (from: T, to: T, progress: number) => T): (T & { frame: number })[] {
  return [{ ...from, frame: at }, ...(frames > 2 ? [{ ...mix(from, to, .75), frame: at + Math.round(frames * .4) }] : []), { ...to, frame: at + frames }];
}
const boxMove = (from: PipBox, to: PipBox, at: number, frames: number): BoxRow[] => eased(from, to, at, frames, mixBox);
const fade = (from: number, to: number, at: number, frames: number): ValueRow[] => eased({ value: from }, { value: to }, at, frames, (a, b, progress) => ({ value: a.value + (b.value - a.value) * progress }));
const FULL: PipBox = { x: 0, y: 0, w: 1, h: 1 };
/** Where a layout's picture comes in from: a split half slides in from its own edge, a window grows from slightly smaller, a full picture fades. */
function pictureEntrance(layout: PipGeometry['resolvedTemplate'], media: PipBox, portrait: boolean): { box?: PipBox; fade: boolean } {
  if (layout === 'split' || layout === 'split-bottom') {
    const after = layout === 'split-bottom';
    return { box: portrait ? { ...media, y: after ? 1 : -media.h } : { ...media, x: after ? 1 : -media.w }, fade: false };
  }
  if (layout === 'inset' || layout === 'dim') return { box: { x: media.x + media.w * .05, y: media.y + media.h * .05, w: media.w * .9, h: media.h * .9 }, fade: true };
  return { fade: true };
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
  const fps = next.canvas.fps; const portrait = next.canvas.height > next.canvas.width;
  const shots = footage.clips.filter((clip): clip is MediaTimelineClip => clip.kind === 'media');
  for (const clip of footage.clips) {
    if (clip.kind !== 'media') continue;
    const asset = next.assets[clip.assetId];
    const firstSource = primary?.clips.find(source => source.kind === 'narrative' && source.enabled && source.startFrame < clip.startFrame + clip.durationFrames && source.startFrame + source.durationFrames > clip.startFrame);
    const sourceAsset = firstSource && 'assetId' in firstSource && firstSource.assetId ? next.assets[firstSource.assetId] : undefined;
    const planned = layouts[clip.id];
    const geometry = resolvePipGeometry(planned ? { ...options, template: planned } : options, next.canvas, { width: asset.metadata?.width ?? next.canvas.width, height: asset.metadata?.height ?? next.canvas.height }, { width: sourceAsset?.metadata?.width ?? next.canvas.width, height: sourceAsset?.metadata?.height ?? next.canvas.height }, captions);
    clip.box = geometry.media; clip.fit = geometry.mediaFit; clip.linkGroupId = clip.id + '-pip';
    const { startFrame, durationFrames, linkGroupId } = clip;
    // A layout eases in and out, except where another shot butts against it: there it cuts.
    const span = Math.min(Math.round(PIP_TRANSITION_SEC * fps), Math.floor(durationFrames / 3));
    const enters = span >= 2 && !shots.some(other => other !== clip && Math.abs(other.startFrame + other.durationFrames - startFrame) <= 1);
    const leaves = span >= 2 && !shots.some(other => other !== clip && Math.abs(other.startFrame - (startFrame + durationFrames)) <= 1);
    const end = durationFrames - span;
    const entrance = pictureEntrance(geometry.resolvedTemplate, geometry.media, portrait);
    const boxRows = [...(enters && entrance.box ? boxMove(entrance.box, geometry.media, 0, span) : []), ...(leaves && entrance.box ? boxMove(geometry.media, entrance.box, end, span) : [])];
    const opacityRows = [...(enters && entrance.fade ? fade(0, 1, 0, span) : []), ...(leaves && entrance.fade ? fade(1, 0, end, span) : [])];
    delete clip.keyframes;
    if (boxRows.length || opacityRows.length) clip.keyframes = { ...(boxRows.length ? { box: boxRows } : {}), ...(opacityRows.length ? { opacity: opacityRows } : {}) };
    // A translucent backdrop (dim) fades with the picture; an opaque one sits behind a speaker that covers the frame as it comes and goes.
    const groundFade = geometry.resolvedTemplate === 'dim' ? [enters ? `tl.fromTo('#${clip.id}-ground > div',{opacity:0},{opacity:1,duration:${(span / fps).toFixed(3)},ease:'power2.out'},0);` : '', leaves ? `tl.to('#${clip.id}-ground > div',{opacity:0,duration:${(span / fps).toFixed(3)},ease:'power2.in'},${(end / fps).toFixed(3)});` : ''].join('') : '';
    if (geometry.background) grounds.push({ id: clip.id + '-ground', kind: 'graphic', enabled: true, startFrame, durationFrames, linkGroupId, anchor: { type: 'timeline' }, block: { templateId: 'custom', label: t('engine.pip.background'), box: { x: 0, y: 0, w: 1, h: 1 }, slots: { innerHtml: `<div style="position:absolute;inset:0;background:${geometry.background}"></div>`, timelineBody: groundFade, authoredDurationSec: durationFrames / next.canvas.fps } } });
    if (geometry.speaker) for (const source of primary?.clips ?? []) {
      if (source.kind !== 'narrative' || !source.enabled) continue;
      const from = Math.max(startFrame, source.startFrame); const to = Math.min(startFrame + durationFrames, source.startFrame + source.durationFrames);
      if (to <= from) continue;
      const rate = (source.sourceOutSec - source.sourceInSec) / source.durationFrames;
      const seat: MediaTimelineClip = { id: clip.id + '-presenter-' + source.id, kind: 'media', assetId: source.assetId, enabled: true, startFrame: from, durationFrames: to - from, sourceInSec: source.sourceInSec + (from - source.startFrame) * rate, sourceOutSec: source.sourceInSec + (to - source.startFrame) * rate, fit: geometry.speakerFit, anchorX: geometry.speakerAnchorX, anchorY: geometry.speakerAnchorY, box: geometry.speaker, linkGroupId, video: { treatment: 'full', audioMuted: true, ...(geometry.speakerCutout ? { personMatte: true } : {}) } };
      // The speaker starts full frame, exactly over the narration underneath, and settles into its seat (and back as the shot ends).
      const local = (frame: number) => frame - from;
      const rows = geometry.speakerCutout ? [] : [...(enters && from === startFrame && to - from > span ? boxMove(FULL, geometry.speaker, 0, span) : []), ...(leaves && to === startFrame + durationFrames && to - from > span ? boxMove(geometry.speaker, FULL, local(startFrame + end), span) : [])];
      if (rows.length) seat.keyframes = { box: rows };
      presenters.push(seat);
    }
  }
  if (grounds.length) next.timeline.tracks.push({ id: groundId, type: 'graphics', name: t('engine.pip.background'), stackOrder: 2, hidden: false, muted: true, locked: false, syncLocked: true, clips: grounds });
  if (presenters.length) next.timeline.tracks.push({ id: presenterId, type: 'visual', name: t('engine.pip.presenter'), stackOrder: 4, hidden: false, muted: true, locked: false, syncLocked: true, clips: presenters });
  for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(5, track.stackOrder);
  return next;
}
