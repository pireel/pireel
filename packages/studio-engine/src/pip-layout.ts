import type { ClipPipLayout, EditorDocumentV2, EditorTrack, GraphicTimelineClip, MediaTimelineClip, TimelineClip } from './editor-document';
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
 * Cells for a group's pictures in one frame: rows of cells chosen so the cells come out closest to
 * square, a thin gap between them.
 */
export function pipGroupCells(region: PipBox, count: number, canvas: Dimensions): PipBox[] {
  if (count <= 1) return [region];
  const width = region.w * canvas.width; const height = region.h * canvas.height; const gap = Math.min(canvas.width, canvas.height) * .012;
  const arrangements: number[][] = count === 2 ? [[2], [1, 1]] : count === 3 ? [[3], [1, 1, 1], [2, 1], [1, 2]] : [[2, 2], [4], [1, 1, 1, 1]];
  const cellsOf = (rows: number[]) => {
    const rowHeight = (height - gap * (rows.length - 1)) / rows.length;
    return rows.flatMap((columns, row) => Array.from({ length: columns }, (_, column) => {
      const cellWidth = (width - gap * (columns - 1)) / columns;
      return { x: region.x + column * (cellWidth + gap) / canvas.width, y: region.y + row * (rowHeight + gap) / canvas.height, w: cellWidth / canvas.width, h: rowHeight / canvas.height };
    }));
  };
  const squareness = (cells: PipBox[]) => cells.reduce((sum, cell) => sum + Math.abs(Math.log(cell.w * canvas.width / (cell.h * canvas.height))), 0);
  return arrangements.map(cellsOf).reduce((best, cells) => squareness(cells) < squareness(best) ? cells : best);
}

interface PipMomentContext {
  document: EditorDocumentV2;
  primary?: EditorTrack;
  captions?: CaptionBand;
  /** The lane's other media clips: a moment butting against one cuts there rather than easing. */
  shots: MediaTimelineClip[];
}
const assetDimensions = (document: EditorDocumentV2, assetId: string) => { const asset = document.assets[assetId]; return { width: asset?.metadata?.width ?? document.canvas.width, height: asset?.metadata?.height ?? document.canvas.height }; };

/**
 * Lay out one moment — a clip, or the clips of a group sharing one frame: their boxes and motion are
 * set in place, and the backdrop and speaker seats the layout needs come back for the caller to place.
 */
function layOutPipMoment(context: PipMomentContext, clip: MediaTimelineClip, members: MediaTimelineClip[], options: PipOptions, planned: PipShotLayout | undefined, linkGroupId?: string, backdropLabel = t('engine.pip.background')): { ground?: GraphicTimelineClip; seats: MediaTimelineClip[] } {
  const { document: next, primary, captions, shots } = context;
  const fps = next.canvas.fps; const portrait = next.canvas.height > next.canvas.width;
  const lead = members[0]!; const grouped = members.length > 1;
  const ends = (item: MediaTimelineClip) => item.startFrame + item.durationFrames;
  const abutsBefore = (frame: number) => shots.some(other => !members.includes(other) && Math.abs(ends(other) - frame) <= 1);
  const abutsAfter = (frame: number) => shots.some(other => !members.includes(other) && Math.abs(other.startFrame - frame) <= 1);
  const dims = (assetId: string) => assetDimensions(next, assetId);
  const firstSource = primary?.clips.find(source => source.kind === 'narrative' && source.enabled && source.startFrame < ends(clip) && source.startFrame + source.durationFrames > clip.startFrame);
  const source = firstSource && 'assetId' in firstSource && firstSource.assetId ? dims(firstSource.assetId) : next.canvas;
  const chosen = planned ?? (options.template === 'smart' ? pipGeometry('smart', next.canvas, dims(lead.assetId), options, source).resolvedTemplate : options.template);
  // A group tiles a window (at its largest) or the dim frame as a square; elsewhere it tiles the place a single picture takes.
  const shape = grouped && (chosen === 'inset' || chosen === 'dim') ? { width: 1, height: 1 } : dims(lead.assetId);
  const geometry = resolvePipGeometry({ ...options, template: chosen, ...(grouped && chosen === 'inset' ? { size: 'large' as const } : {}) }, next.canvas, shape, source, captions);
  // A group's tiling grows as its pictures arrive, so the frame is never left with empty cells: a
  // picture takes its cell among those already there, and moves over as each later one comes in.
  const place = members.indexOf(clip);
  const cellAt = (count: number) => grouped ? pipGroupCells(geometry.media, count, next.canvas)[place]! : geometry.media;
  const arrivals = members.map((member, index) => ({ index, frame: member.startFrame })).filter(({ index, frame }) => index > place && frame > clip.startFrame);
  const box = cellAt(members.length);
  const firstBox = cellAt(members.filter(member => member.startFrame <= clip.startFrame).length);
  const background = geometry.background ?? (grouped ? '#171717' : undefined);
  clip.box = box; clip.fit = grouped ? 'cover' : geometry.mediaFit;
  const link = linkGroupId ? { linkGroupId } : {};
  const groupStart = lead.startFrame; const groupEnd = Math.max(...members.map(ends));
  // A layout eases in and out, except where another moment butts against it: there it cuts.
  const span = Math.min(Math.round(PIP_TRANSITION_SEC * fps), Math.floor(clip.durationFrames / 3), Math.floor((groupEnd - groupStart) / 3));
  const enters = span >= 2 && !abutsBefore(clip.startFrame);
  const leaves = span >= 2 && !abutsAfter(ends(clip));
  const end = clip.durationFrames - span;
  const entrance = pictureEntrance(geometry.resolvedTemplate, firstBox, portrait); const exit = pictureEntrance(geometry.resolvedTemplate, box, portrait);
  const regrows = arrivals.flatMap(({ index, frame }) => { const at = frame - clip.startFrame; return at + span <= end ? boxMove(cellAt(index), cellAt(index + 1), at, span) : []; });
  const boxRows = [...(enters && entrance.box ? boxMove(entrance.box, firstBox, 0, span) : regrows.length ? [{ ...firstBox, frame: 0 }] : []), ...regrows, ...(leaves && exit.box ? boxMove(box, exit.box, end, span) : [])];
  const opacityRows = [...(enters && entrance.fade ? fade(0, 1, 0, span) : []), ...(leaves && entrance.fade ? fade(1, 0, end, span) : [])];
  delete clip.keyframes;
  if (boxRows.length || opacityRows.length) clip.keyframes = { ...(boxRows.length ? { box: boxRows } : {}), ...(opacityRows.length ? { opacity: opacityRows } : {}) };
  // The seat and backdrop belong to the moment: the lead clip lays them out over the group's span.
  if (clip !== lead) return { seats: [] };
  const seatEnters = span >= 2 && !abutsBefore(groupStart); const seatLeaves = span >= 2 && !abutsAfter(groupEnd);
  const seatEnd = groupEnd - groupStart - span;
  // A translucent backdrop (dim) fades with the picture; an opaque one sits behind a speaker that covers the frame as it comes and goes.
  const groundFade = geometry.resolvedTemplate === 'dim' ? [seatEnters ? `tl.fromTo('#${lead.id}-ground > div',{opacity:0},{opacity:1,duration:${(span / fps).toFixed(3)},ease:'power2.out'},0);` : '', seatLeaves ? `tl.to('#${lead.id}-ground > div',{opacity:0,duration:${(span / fps).toFixed(3)},ease:'power2.in'},${(seatEnd / fps).toFixed(3)});` : ''].join('') : '';
  const ground: GraphicTimelineClip | undefined = background ? { id: lead.id + '-ground', kind: 'graphic', enabled: true, startFrame: groupStart, durationFrames: groupEnd - groupStart, ...link, anchor: { type: 'timeline' }, block: { templateId: 'custom', label: backdropLabel, box: { x: 0, y: 0, w: 1, h: 1 }, slots: { innerHtml: `<div style="position:absolute;inset:0;background:${background}"></div>`, timelineBody: groundFade, authoredDurationSec: (groupEnd - groupStart) / fps } } } : undefined;
  const seats: MediaTimelineClip[] = [];
  if (geometry.speaker) for (const narration of primary?.clips ?? []) {
    if (narration.kind !== 'narrative' || !narration.enabled) continue;
    const from = Math.max(groupStart, narration.startFrame); const to = Math.min(groupEnd, narration.startFrame + narration.durationFrames);
    if (to <= from) continue;
    const rate = (narration.sourceOutSec - narration.sourceInSec) / narration.durationFrames;
    const seat: MediaTimelineClip = { id: lead.id + '-presenter-' + narration.id, kind: 'media', assetId: narration.assetId, enabled: true, startFrame: from, durationFrames: to - from, sourceInSec: narration.sourceInSec + (from - narration.startFrame) * rate, sourceOutSec: narration.sourceInSec + (to - narration.startFrame) * rate, fit: geometry.speakerFit, anchorX: geometry.speakerAnchorX, anchorY: geometry.speakerAnchorY, box: geometry.speaker, ...link, video: { treatment: 'full', audioMuted: true, ...(geometry.speakerCutout ? { personMatte: true } : {}) } };
    // The speaker starts full frame, exactly over the narration underneath, and settles into its seat (and back as the moment ends).
    const rows = geometry.speakerCutout ? [] : [...(seatEnters && from === groupStart && to - from > span ? boxMove(FULL, geometry.speaker, 0, span) : []), ...(seatLeaves && to === groupEnd && to - from > span ? boxMove(geometry.speaker, FULL, groupStart + seatEnd - from, span) : [])];
    if (rows.length) seat.keyframes = { box: rows };
    seats.push(seat);
  }
  return { ground, seats };
}

const captionBandOf = (document: EditorDocumentV2) => document.timeline.tracks.some(track => track.type === 'caption' && track.clips.length > 0) ? captionBandFor(document.appearance.captionStyle) : undefined;

/**
 * Rebuild only the layout layers tied to actual footage windows. The source audio stays intact.
 * `layouts` holds a clip's own layout (planned or chosen); other clips follow the template, and smart fit goes by shape.
 * `groups` names the group of clips that share one frame, and each clip's place in its tiling order: they tile the picture's place in the layout
 * (a window or the dim frame tiled as a square), under one speaker seat and backdrop for the group's span.
 */
export function applyPipLayout(document: EditorDocumentV2, options: PipOptions, trackId = 'broll', layouts: Record<string, PipShotLayout> = {}, groups: Record<string, { id: string; index: number }> = {}): EditorDocumentV2 {
  const next = structuredClone(document); const footage = next.timeline.tracks.find(track => track.id === trackId);
  if (!footage) return next;
  const groundId = trackId + '-pip-ground'; const presenterId = trackId + '-pip-presenter';
  next.timeline.tracks = next.timeline.tracks.filter(track => ![groundId, presenterId].includes(track.id));
  const grounds: GraphicTimelineClip[] = []; const presenters: MediaTimelineClip[] = [];
  const primary = next.timeline.tracks.find(track => track.id === next.semantics.primaryNarrativeTrackId);
  footage.stackOrder = 3;
  const shots = footage.clips.filter((clip): clip is MediaTimelineClip => clip.kind === 'media');
  const context: PipMomentContext = { document: next, primary, captions: captionBandOf(next), shots };
  const membersOf = (clip: MediaTimelineClip) => groups[clip.id] ? shots.filter(other => groups[other.id]?.id === groups[clip.id]!.id).sort((a, b) => groups[a.id]!.index - groups[b.id]!.index) : [clip];
  for (const clip of shots) {
    const members = membersOf(clip); const lead = members[0]!;
    clip.linkGroupId = lead.id + '-pip';
    const { ground, seats } = layOutPipMoment(context, clip, members, options, layouts[lead.id], clip.linkGroupId);
    if (ground) grounds.push(ground);
    presenters.push(...seats);
  }
  if (grounds.length) next.timeline.tracks.push({ id: groundId, type: 'graphics', name: t('engine.pip.background'), stackOrder: 2, hidden: false, muted: true, locked: false, syncLocked: true, clips: grounds });
  if (presenters.length) next.timeline.tracks.push({ id: presenterId, type: 'visual', name: t('engine.pip.presenter'), stackOrder: 4, hidden: false, muted: true, locked: false, syncLocked: true, clips: presenters });
  for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(5, track.stackOrder);
  return next;
}

/** The clip's backdrop and speaker seat (clip-level layouts) or a scene layout's, by the ids layouts give them. */
export const isPipCompanionOf = (clipId: string, candidateId: string) => candidateId === clipId + '-ground' || candidateId.startsWith(clipId + '-presenter-');

/**
 * Derive every clip-level layout (`pipLayout`) from scratch: the clip's box and motion, and the
 * backdrop just under its lane and the speaker seat just over it. Runs after every commit, so a
 * seat keeps showing the words spoken under it through cuts, moves and retimes.
 */
export function refreshClipPipLayouts(document: EditorDocumentV2): EditorDocumentV2 {
  const laid = (clip: TimelineClip): clip is MediaTimelineClip & { pipLayout: NonNullable<MediaTimelineClip['pipLayout']> } => clip.kind === 'media' && !!clip.pipLayout;
  const tracks = document.timeline.tracks;
  if (!tracks.some(track => track.role === 'pipLayer' || track.clips.some(laid))) return document;
  const primary = tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId);
  const captions = captionBandOf(document);
  const out: EditorTrack[] = [];
  for (const track of tracks) {
    if (track.role === 'pipLayer') continue;
    if (track === primary || track.type !== 'visual' || !track.clips.some(laid)) { out.push(track); continue; }
    const clips = track.clips.map(clip => laid(clip) ? { ...clip } : clip);
    const shots = clips.filter((clip): clip is MediaTimelineClip => clip.kind === 'media');
    const context: PipMomentContext = { document, primary, captions, shots };
    const grounds: GraphicTimelineClip[] = []; const seats: MediaTimelineClip[] = [];
    for (const clip of clips) {
      if (!laid(clip) || !clip.enabled) continue;
      const { layout, position, size } = clip.pipLayout;
      // Every host derives these bytes identically, so nothing here depends on the viewer's language.
      const moment = layOutPipMoment(context, clip, [clip], { template: layout, ...(position ? { position } : {}), ...(size ? { size } : {}) }, layout, undefined, 'backdrop');
      if (moment.ground) grounds.push(moment.ground);
      seats.push(...moment.seats);
    }
    const lane = (suffix: string, type: EditorTrack['type'], stackOrder: number, items: TimelineClip[]): EditorTrack => ({ id: `${track.id}-layout-${suffix}`, type, role: 'pipLayer', stackOrder, hidden: track.hidden, muted: true, locked: false, syncLocked: false, clips: items });
    // Between this lane and whatever sits under it; index 0 is the main video, so never at or below it.
    const below = Math.max(0, ...tracks.filter(other => other !== track && other.type !== 'audio' && other.role !== 'pipLayer' && other.stackOrder < track.stackOrder).map(other => other.stackOrder));
    if (grounds.length) out.push(lane('backdrop', 'graphics', (below + track.stackOrder) / 2, grounds));
    out.push({ ...track, clips });
    const above = Math.min(track.stackOrder + 1, ...tracks.filter(other => other !== track && other.type !== 'audio' && other.role !== 'pipLayer' && other.stackOrder > track.stackOrder).map(other => other.stackOrder));
    if (seats.length) out.push(lane('speaker', 'visual', (track.stackOrder + above) / 2, seats));
  }
  return { ...document, timeline: { ...document.timeline, tracks: out } };
}

/** Clip-level layouts: the layouts a single picture can take with the speaker (full frame is no layout). */
export const CLIP_PIP_LAYOUTS = ['inset', 'presenter', 'split', 'split-bottom', 'dim'] as const satisfies readonly ClipPipLayout['layout'][];
export const isClipPipLayout = (value: unknown): value is ClipPipLayout => {
  const row = value as ClipPipLayout | null;
  return !!row && typeof row === 'object' && (CLIP_PIP_LAYOUTS as readonly string[]).includes(row.layout)
    && (row.position === undefined || ['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(row.position))
    && (row.size === undefined || ['small', 'medium', 'large'].includes(row.size));
};

export type SetClipPipLayoutResult = { ok: true; document: EditorDocumentV2 } | { ok: false; code: 'clip-not-found' | 'invalid-command'; error: string };
/**
 * Give one picture over the speaker a layout, or (null) return it to full frame. The picture's own
 * corner/split framing and any layers a scene laid out for it give way; the next commit derives the rest.
 */
export function setClipPipLayout(document: EditorDocumentV2, input: { clipId: string; layout: ClipPipLayout | null }): SetClipPipLayoutResult {
  const track = document.timeline.tracks.find(candidate => candidate.clips.some(clip => clip.id === input.clipId));
  const clip = track?.clips.find(candidate => candidate.id === input.clipId);
  if (!track || !clip) return { ok: false, code: 'clip-not-found', error: `Clip does not exist: ${input.clipId}` };
  if (clip.kind !== 'media' || track.type !== 'visual' || track.id === document.semantics.primaryNarrativeTrackId || track.role === 'pipLayer') {
    return { ok: false, code: 'invalid-command', error: 'A layout applies to a video or image clip laid over the story spine, not to the spine itself, a graphic or a derived layout layer.' };
  }
  if (input.layout !== null && !isClipPipLayout(input.layout)) {
    return { ok: false, code: 'invalid-command', error: `layout must be one of ${CLIP_PIP_LAYOUTS.join(', ')}, with optional position (corner) and size (small, medium, large).` };
  }
  const { pipLayout: _previous, keyframes: _keyframes, box: _box, mediaFraming: _framing, ...rest } = clip;
  const ownLink = rest.linkGroupId === clip.id + '-pip';
  const next: MediaTimelineClip = {
    ...rest,
    ...(input.layout ? { pipLayout: input.layout } : { fit: 'cover' as const }),
    // A corner or split framing would shrink the picture again inside its layout.
    ...(rest.video ? { video: { ...pickVideoKeep(rest.video), treatment: 'full' as const } } : {}),
  };
  if (ownLink) delete next.linkGroupId;
  const tracks = document.timeline.tracks.map(candidate => {
    if (candidate === track) return { ...candidate, clips: candidate.clips.map(item => item === clip ? next : item) };
    const kept = candidate.clips.filter(item => !isPipCompanionOf(clip.id, item.id));
    return kept.length === candidate.clips.length ? candidate : { ...candidate, clips: kept };
  });
  return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } } };
}
/** The video settings a layout leaves alone: grade, zoom, matte and sound. */
function pickVideoKeep(video: NonNullable<MediaTimelineClip['video']>): Partial<NonNullable<MediaTimelineClip['video']>> {
  const { treatment: _treatment, treatSize: _size, treatCrop: _crop, preciseFraming: _precise, ...keep } = video;
  return keep;
}

/** For a clip on a derived layout layer, the picture whose layout made it; null for any other clip. */
export function pipLayerOwner(document: EditorDocumentV2, clipId: string): string | null {
  if (!document.timeline.tracks.some(track => track.role === 'pipLayer' && track.clips.some(clip => clip.id === clipId))) return null;
  for (const track of document.timeline.tracks) for (const clip of track.clips) if (clip.kind === 'media' && clip.pipLayout && isPipCompanionOf(clip.id, clipId)) return clip.id;
  return null;
}
