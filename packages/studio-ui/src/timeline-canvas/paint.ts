/**
 * Draws the timeline into a canvas the size of the visible area. Each frame paints only what the
 * window shows, so its cost follows the screen and not the length of the project.
 */
import type { AudioClip, BlockKind } from '@pireel/studio-engine/composition';
import { audioClipDefaults, shotFadeAt } from '@pireel/studio-engine/composition';
import type { FilmstripFrame } from '@pireel/studio-ui/media';
import { EDGE_PAD, type TimelineMetrics, fmtTick, rulerStep, visibleStripTiles } from '../timeline-utils';
import { WAVE_FLOOR_DB } from '../timeline-wave';
import { type TimelineItem, type TimelineLayout, itemBox, itemsBetween, liveKey } from './layout';
import { CHIP_LABEL_H, KNEE_RADIUS, MUTE_BUTTON, audioChip, fadeOutline, kneeY } from './audio-chip';
import { slipButtonBox, trimHandleWidth } from './targets';
import type { TimelineColors } from './theme';

const RADIUS = 4;

/** How an item is drawn while a gesture holds it. */
export interface TimelineLiveItem {
  startSec: number;
  endSec: number;
  /** Top in the tracks area, when the gesture carries it to another lane. */
  top?: number;
  /** Drawn over its neighbours, lifted off its lane. */
  raised?: boolean;
  /** Left faint in place while its ghost follows the pointer. */
  faint?: boolean;
  /** The source window a trim or slip would leave, for the thumbnails and the wave. */
  sourceIn?: number;
  sourceOut?: number;
  /** A reading shown on the card (a slip's source window). */
  note?: string;
  /** An audio clip's fields as the gesture would leave them (start, in and out points, fades). */
  audio?: Partial<AudioClip>;
}

/** What a gesture in progress adds to the picture. Mutated in place by the gesture; read every frame. */
export interface TimelineLiveEdit {
  items: Map<string, TimelineLiveItem>;
  /** A lifted video or image: drawn at the pointer while the original stays faint. */
  ghost: { item: Extract<TimelineItem, { kind: 'shot' | 'visual' }>; startSec: number; top: number } | null;
  /** Where a new lane would be made. */
  line: { top: number; tone: 'graphic' | 'media' } | null;
  /** Content px across, tracks px down. */
  marquee: { left: number; right: number; top: number; bottom: number } | null;
  /** Where something dragged in from a panel would land: the second, what will happen in words, and
   *  for a video or image the place its clip would take. */
  drop: { sec: number; label: string; box: { top: number; height: number; durationSec: number } | null } | null;
}
export const emptyLiveEdit = (): TimelineLiveEdit => ({ items: new Map(), ghost: null, line: null, marquee: null, drop: null });

export interface TimelinePaintState {
  edit: TimelineLiveEdit;
  /** Room between the ruler and the first lane (a strip the page lays over the canvas there). */
  topInset: number;
  /** Shots whose source can be slipped show a button for it under the pointer; `open` is the shot whose panel is up. */
  slip: { can(shotId: string): boolean; open: string | null };
  /** A video is being dragged in: the empty story lane says to let go on it. */
  videoDragging: boolean;
  /** A clip is being fetched for this second: it shows as on its way. */
  insertingAtSec: number | null;
  /** Canvas size in CSS px, and the device's pixel ratio. The canvas may be wider than the window:
   *  `scrollLeft` is then where its left edge sits in the lanes, not where the window is. */
  width: number;
  height: number;
  dpr: number;
  scrollLeft: number;
  scrollTop: number;
  pps: number;
  durationSec: number;
  /** Width of the lanes in px: the project plus its editing tail. */
  surfaceWidth: number;
  layout: TimelineLayout;
  metrics: TimelineMetrics;
  colors: TimelineColors;
  playheadSec: number;
  hoverSec: number | null;
  framePick: boolean;
  guideSec: number | null;
  /** The item under the pointer, for its hover frame and its trim handles. */
  hoverId: string | null;
  /** Captions can be trimmed here: they show handles. */
  captionsTrim: boolean;
  selectedShots: ReadonlySet<string>;
  selectedBlocks: ReadonlySet<string>;
  selectedVisualId: string | null;
  selectedAudioId: string | null;
  selectedTransitionId: string | null;
  disabledIds?: ReadonlySet<string>;
  filmstrip: readonly FilmstripFrame[];
  clipStrips: Readonly<Record<string, FilmstripFrame[]>>;
  sourcePeaks?: ReadonlyMap<string, { peaks: Float32Array; durationSec: number }>;
  audioPeaks?: ReadonlyMap<string, Float32Array>;
  mainLive: boolean;
  sourceLive?: (source: string) => boolean;
  /** A picture by address; null until it has loaded (the loader asks for another frame then). */
  image(url: string): CanvasImageSource | null;
  kindIcon(kind: BlockKind): CanvasImageSource | null;
  /** A small glyph by name: 'audio', 'audio-muted', 'sound-on', 'sound-off', 'drop-audio', or 'transition:<effect>'. */
  icon(name: string): CanvasImageSource | null;
  /** Audio clips have a mute switch here. */
  audioMute: boolean;
  labels: { video: string; image: string; captions: string; music: string; missing: string; dropAudio: string; emptySpine: string; dropOnSpine: string; inserting: string; blockTitle(item: Extract<TimelineItem, { kind: 'block' }>): string };
}

/** Where second zero sits on the canvas, and where the lanes begin under the sticky ruler. */
export const originX = (state: Pick<TimelinePaintState, 'scrollLeft'>) => EDGE_PAD - state.scrollLeft;
export const tracksY = (state: Pick<TimelinePaintState, 'scrollTop' | 'metrics' | 'topInset'>) => state.metrics.rulerH + state.topInset - state.scrollTop;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

const fitted = new Map<string, string>();
/** The text cut to a width with an ellipsis; measured once per text, font and width. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 4 || !text) return '';
  const key = `${ctx.font}|${Math.floor(maxWidth)}|${text}`;
  const known = fitted.get(key);
  if (known !== undefined) return known;
  let out = text;
  if (ctx.measureText(text).width > maxWidth) {
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (ctx.measureText(text.slice(0, middle) + '…').width <= maxWidth) low = middle; else high = middle - 1;
    }
    out = low > 0 ? text.slice(0, low) + '…' : '';
  }
  if (fitted.size > 4000) fitted.clear();
  fitted.set(key, out);
  return out;
}

/** A picture drawn to fill a box, cropped like object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw = (image as HTMLImageElement).naturalWidth || (image as HTMLCanvasElement).width;
  const ih = (image as HTMLImageElement).naturalHeight || (image as HTMLCanvasElement).height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * A waveform band: one bar per px column, tallest peak of the samples behind it, on the dB scale the
 * DOM timeline uses (waveBars). `from`/`to` are peak indices across the whole band width; only the
 * columns inside [clipLeft, clipRight] are drawn.
 */
function drawWave(
  ctx: CanvasRenderingContext2D, peaks: Float32Array, from: number, to: number,
  x: number, bottom: number, width: number, height: number, shiftDb: number,
  clipLeft: number, clipRight: number, envelope?: (fraction: number) => number,
) {
  const first = Math.max(0, Math.floor(clipLeft - x));
  const last = Math.min(Math.ceil(width), Math.ceil(clipRight - x));
  if (last <= first || width <= 0) return;
  const perPx = (to - from) / width;
  ctx.beginPath();
  for (let column = first; column < last; column += 1) {
    const s0 = Math.max(0, Math.floor(from + column * perPx));
    const s1 = Math.min(peaks.length, Math.max(s0 + 1, Math.floor(from + (column + 1) * perPx)));
    let peak = 0;
    for (let index = s0; index < s1; index += 1) if (peaks[index]! > peak) peak = peaks[index]!;
    const db = peak > 0 ? 20 * Math.log10(peak) + shiftDb : WAVE_FLOOR_DB;
    const level = Math.max(0, Math.min(1, (db - WAVE_FLOOR_DB) / -WAVE_FLOOR_DB));
    const bar = Math.max(0.7, level * (height - 1)) * (envelope ? envelope((column + 0.5) / width) : 1);
    if (bar > 0.05) ctx.rect(x + column, bottom - bar, 1, bar);
  }
  ctx.fill();
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, colors: TimelineColors, weight = 400, fill = colors.badge) {
  ctx.font = `${weight} 9px ${colors.font}`;
  const label = fit(ctx, text, maxWidth - 8);
  if (!label) return;
  ctx.fillStyle = fill;
  roundedRect(ctx, x, y, ctx.measureText(label).width + 8, 14, 4);
  ctx.fill();
  ctx.fillStyle = colors.white;
  ctx.fillText(label, x + 4, y + 7.5);
}

/** Inside frame of a clip card: the selection colour, the hover tint, or the resting hairline. */
function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, radius = RADIUS) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
}

/** A video card: its thumbnails over its own audio band. */
function videoCard(
  ctx: CanvasRenderingContext2D, state: TimelinePaintState, box: { x: number; y: number; w: number; h: number },
  clip: { startSec: number; endSec: number; sourceIn: number; sourceOut: number; strip: readonly FilmstripFrame[]; still?: string; live: boolean; peaksKey?: string; volumeDb: number; muted: boolean; envelope?: (fraction: number) => number },
) {
  const { colors, metrics, pps } = state;
  const filmH = box.h - metrics.sceneWaveH;
  ctx.save();
  roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
  ctx.clip();
  ctx.fillStyle = colors.clip;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  if (!clip.live) {
    ctx.fillStyle = colors.missing;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.font = `400 9px ${colors.font}`;
    ctx.fillStyle = colors.ink4;
    ctx.textAlign = 'center';
    ctx.fillText(fit(ctx, state.labels.missing, box.w - 8), box.x + box.w / 2, box.y + box.h / 2);
    ctx.textAlign = 'left';
  } else if (clip.still) {
    const image = state.image(clip.still);
    if (image) drawCover(ctx, image, box.x, box.y, box.w, box.h);
  } else if (!clip.strip.length) {
    ctx.fillStyle = colors.accentWash;
    ctx.fillRect(box.x, box.y, box.w, filmH);
  } else {
    // Only the tiles the window shows; the grid stays anchored on source time (visibleStripTiles).
    const fromSec = clip.startSec + Math.max(0, -box.x) / pps;
    const toSec = clip.startSec + Math.min(box.w, state.width - box.x) / pps;
    for (const tile of visibleStripTiles(clip.strip as FilmstripFrame[], clip.sourceIn, clip.sourceOut, filmH / pps, pps, clip.startSec, fromSec, toSec, clip.endSec)) {
      const image = state.image(tile.url);
      if (image) drawCover(ctx, image, box.x + tile.left, box.y, tile.width, filmH);
    }
  }
  const sound = clip.live && clip.peaksKey ? state.sourcePeaks?.get(clip.peaksKey) : undefined;
  if (sound && sound.durationSec > 0 && box.w >= 6 && !clip.still) {
    const per = sound.peaks.length / sound.durationSec;
    ctx.fillStyle = colors.accentBody;
    ctx.fillRect(box.x, box.y + filmH, box.w, metrics.sceneWaveH);
    ctx.fillStyle = clip.muted ? colors.waveMuted : colors.wave;
    drawWave(ctx, sound.peaks, clip.sourceIn * per, clip.sourceOut * per, box.x, box.y + box.h, box.w, metrics.sceneWaveH, clip.volumeDb, 0, state.width, clip.envelope);
  }
  ctx.restore();
}

export function paintTimeline(ctx: CanvasRenderingContext2D, state: TimelinePaintState): void {
  const { colors, metrics, layout, pps, width, height } = state;
  const x0 = originX(state);
  const y0 = tracksY(state);
  const X = (second: number) => x0 + second * pps;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.panel;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, metrics.rulerH, width, height - metrics.rulerH);
  ctx.clip();

  ctx.fillStyle = colors.row;
  for (const lane of layout.lanes) {
    const top = y0 + lane.top;
    if (top > height || top + lane.height < metrics.rulerH) continue;
    roundedRect(ctx, x0, top, state.surfaceWidth, lane.height, 4);
    ctx.fill();
  }

  // A story lane with nothing on it is still there, and asks for a video.
  if (!layout.byKind.shot.length) {
    const lane = layout.laneByKey.get(0);
    if (lane) {
      const inset = layout.sceneRail ? { top: 12, bottom: 8 } : { top: 4, bottom: 4 };
      const box = { x: x0 + 8, y: y0 + lane.top + inset.top, w: Math.max(220, state.surfaceWidth - 16), h: lane.height - inset.top - inset.bottom };
      ctx.fillStyle = state.videoDragging ? colors.accentLabel : colors.panelFaint;
      roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
      ctx.fill();
      ctx.setLineDash([4, 3]);
      frame(ctx, box.x, box.y, box.w, box.h, state.videoDragging ? colors.accentSoft : colors.lineStrong);
      ctx.setLineDash([]);
      const text = state.videoDragging ? state.labels.dropOnSpine : state.labels.emptySpine;
      ctx.font = `500 10px ${colors.font}`;
      const textWidth = ctx.measureText(text).width;
      const middle = (Math.max(0, box.x) + Math.min(width, box.x + box.w)) / 2;
      const glyph = state.icon(state.videoDragging ? 'spine-drop' : 'spine-empty');
      if (glyph) ctx.drawImage(glyph, middle - textWidth / 2 - 18, box.y + box.h / 2 - 6, 12, 12);
      ctx.fillStyle = state.videoDragging ? colors.accentInk : colors.ink4;
      ctx.fillText(text, middle - textWidth / 2, box.y + box.h / 2 + 0.5);
    }
  }

  const fromSec = -x0 / pps;
  const toSec = (width - x0) / pps;
  const slack = 32 / pps;
const held = state.edit.items;
  const liveOf = (item: TimelineItem) => (held.size ? held.get(liveKey(item)) : undefined);
  const visible = <K extends TimelineItem['kind']>(kind: K) => {
    const list = itemsBetween(layout.byKind[kind], fromSec, toSec, slack).filter((item) => y0 + item.top < height && y0 + item.top + item.height > metrics.rulerH);
    if (!held.size) return list;
    // What a gesture holds is drawn wherever it is held, and last, over its neighbours.
    const mine = layout.byKind[kind].filter((item) => held.has(liveKey(item)));
    return mine.length ? [...list.filter((item) => !mine.includes(item)), ...mine] : list;
  };
  const boxOf = (item: TimelineItem) => {
    const live = liveOf(item);
    const { left, width: w } = live ? itemBox({ ...item, startSec: live.startSec, endSec: live.endSec }, pps) : itemBox(item, pps);
    return { x: x0 + left, y: y0 + (live?.top ?? item.top), w, h: item.height };
  };
  /** The two trim handles of a card: solid in its tone when selected, a grey hint under the pointer. */
  const handles = (item: TimelineItem, box: { x: number; y: number; w: number; h: number }, selected: boolean, tone: string) => {
    if (!selected && state.hoverId !== item.id) return;
    const w = Math.min(trimHandleWidth(item), box.w / 2);
    ctx.fillStyle = selected ? tone : colors.handleHover;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, w, box.h, [2, 0, 0, 2]);
    ctx.roundRect(box.x + box.w - w, box.y, w, box.h, [0, 2, 2, 0]);
    ctx.fill();
    if (selected) {
      ctx.fillStyle = colors.panel;
      ctx.fillRect(box.x + w / 2 - 1, box.y + box.h / 4, 2, box.h / 2);
      ctx.fillRect(box.x + box.w - w / 2 - 1, box.y + box.h / 4, 2, box.h / 2);
    }
  };
  const reading = (text: string, box: { x: number; y: number; w: number; h: number }) => {
    ctx.font = `400 9px ${colors.monoFont}`;
    ctx.fillStyle = colors.ink3;
    ctx.textAlign = 'right';
    ctx.fillText(text, box.x + box.w - 10, box.y + box.h / 2 + 0.5);
    ctx.textAlign = 'left';
  };
  const dim = (id: string, enabled = true) => { const off = !enabled || !!state.disabledIds?.has(id); ctx.globalAlpha = off ? 0.45 : 1; ctx.filter = off ? 'grayscale(1)' : 'none'; };
  const lit = () => { ctx.globalAlpha = 1; ctx.filter = 'none'; };

  for (const item of visible('shot')) {
    const box = boxOf(item);
    const { shot } = item;
    const span = Math.max(0.01, shot.srcEnd - shot.srcStart);
    const faded = !!(shot.audioFadeInSec || shot.audioFadeOutSec);
    const live = liveOf(item);
    dim(item.id, item.enabled);
    if (live?.faint) ctx.globalAlpha = 0.3;
    videoCard(ctx, state, box, {
      startSec: live?.startSec ?? item.startSec, endSec: live?.endSec ?? item.endSec, sourceIn: live?.sourceIn ?? shot.srcStart, sourceOut: live?.sourceOut ?? shot.srcEnd,
      strip: shot.src ? state.clipStrips[shot.src] ?? [] : state.filmstrip, live: shot.src ? state.sourceLive?.(shot.src) ?? true : state.mainLive,
      peaksKey: shot.src ?? 'main', volumeDb: shot.audioMuted ? WAVE_FLOOR_DB : shot.volumeDb ?? 0, muted: !!shot.audioMuted,
      envelope: faded ? (fraction) => shotFadeAt(shot, fraction * span, span) : undefined,
    });
    if (live?.note) badge(ctx, live.note, box.x + 4, box.y + 4, box.w, colors, 400, colors.badgeStrong);
    else if (box.w > 22) badge(ctx, String(item.index + 1), box.x + 4, box.y + 4, box.w, colors, 600);
    frame(ctx, box.x, box.y, box.w, box.h, live?.faint ? colors.frame : state.selectedShots.has(item.id) ? colors.accentInk : state.hoverId === item.id ? colors.frameHover : colors.frame);
    if (!live?.faint) handles(item, box, state.selectedShots.has(item.id), colors.accentInk);
    const button = (state.hoverId === item.id || state.slip.open === item.id) && !live?.faint && state.slip.can(item.id) ? slipButtonBox(box) : null;
    if (button) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.badgeStrong;
      roundedRect(ctx, button.x, button.y, button.size, button.size, 4);
      ctx.fill();
      const glyph = state.icon('slip');
      if (glyph) ctx.drawImage(glyph, button.x + 3, button.y + 3, 10, 10);
    }
    lit();
  }

  for (const item of visible('visual')) {
    const box = boxOf(item);
    const { clip } = item;
    const live = liveOf(item);
    dim(item.id, clip.enabled);
    if (live?.faint) ctx.globalAlpha = 0.3;
    videoCard(ctx, state, box, {
      startSec: live?.startSec ?? item.startSec, endSec: live?.endSec ?? item.endSec, sourceIn: clip.sourceInSec, sourceOut: clip.sourceOutSec,
      strip: clip.kind === 'image' ? [] : clip.usePrimaryFilmstrip ? state.filmstrip : (clip.source ? state.clipStrips[clip.source] : undefined) ?? [],
      still: clip.kind === 'image' ? clip.source : undefined,
      live: clip.kind === 'image' || (clip.usePrimaryFilmstrip ? state.mainLive : !clip.source || (state.sourceLive?.(clip.source) ?? true)),
      peaksKey: clip.kind === 'video' ? (clip.usePrimaryFilmstrip ? 'main' : clip.source) : undefined, volumeDb: 0, muted: false,
    });
    if (clip.kind === 'image' && box.w > 46) badge(ctx, clip.label || state.labels.image, box.x + 4, box.y + box.h - 18, box.w, colors);
    frame(ctx, box.x, box.y, box.w, box.h, live?.faint ? colors.frame : state.selectedVisualId === item.id ? colors.accentInk : state.hoverId === item.id ? colors.frameHover : colors.frame);
    if (!live?.faint) handles(item, box, state.selectedVisualId === item.id, colors.accentInk);
    lit();
  }

  for (const item of visible('block')) {
    const box = boxOf(item);
    const kind = colors.kinds[item.blockKind];
    const selected = state.selectedBlocks.has(item.id);
    const live = liveOf(item);
    dim(item.id);
    if (live?.raised) { ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; }
    ctx.fillStyle = selected ? kind.fillSelected : kind.fill;
    roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (live?.raised) ctx.fill(); // lifted: a shade brighter, like the hover wash
    if (state.hoverId === item.id && !selected) ctx.fill(); // the hover tint: the same wash once more
    ctx.save();
    ctx.clip();
    const icon = state.kindIcon(item.blockKind);
    if (icon && box.w > 24) ctx.drawImage(icon, box.x + 8, box.y + (box.h - 11) / 2, 11, 11);
    ctx.font = `500 10px ${colors.font}`;
    ctx.fillStyle = colors.ink;
    const timed = selected && box.w > 92;
    ctx.fillText(fit(ctx, state.labels.blockTitle(item), box.w - 31 - (timed ? 62 : 0)), box.x + 23, box.y + box.h / 2 + 0.5);
    if (timed) reading(`${(live?.startSec ?? item.startSec).toFixed(1)}–${(live?.endSec ?? item.endSec).toFixed(1)}`, box);
    ctx.restore();
    frame(ctx, box.x, box.y, box.w, box.h, selected ? kind.lineSelected : kind.line);
    handles(item, box, selected, kind.lineSelected);
    lit();
  }

  for (const item of visible('caption')) {
    const box = boxOf(item);
    const selected = state.selectedBlocks.has(item.id);
    dim(item.id);
    ctx.fillStyle = state.hoverId === item.id ? colors.captionHover : colors.caption;
    roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
    ctx.fill();
    if (box.w > 20) {
      ctx.font = `400 10px ${colors.font}`;
      ctx.fillStyle = colors.ink2;
      const timed = selected && box.w > 82;
      ctx.fillText(fit(ctx, item.block.label || state.labels.captions, box.w - 16 - (timed ? 34 : 0)), box.x + 8, box.y + box.h / 2 + 0.5);
      const live = liveOf(item);
      if (timed) reading(`${((live?.endSec ?? item.block.startSec + item.block.durationSec) - (live?.startSec ?? item.startSec)).toFixed(1)}s`, box);
    }
    frame(ctx, box.x, box.y, box.w, box.h, selected ? colors.captionSelected : colors.captionLine);
    if (state.captionsTrim && box.w >= 18 && !state.disabledIds?.has(item.id)) handles(item, box, selected, colors.captionSelected);
    lit();
  }

  // An audio lane with nothing on it says what it is for.
  const occupied = new Set(layout.byKind.audio.map((item) => item.lane));
  for (const lane of layout.lanes) {
    if (!lane.audio || occupied.has(lane.key)) continue;
    const box = { x: x0, y: y0 + lane.top + 2, w: state.surfaceWidth, h: lane.height - 4 };
    ctx.setLineDash([4, 3]);
    frame(ctx, box.x, box.y, box.w, box.h, colors.accentDashed);
    ctx.setLineDash([]);
    ctx.font = `400 10px ${colors.font}`;
    ctx.fillStyle = colors.accentInk;
    const middle = Math.max(0, Math.min(width, box.x + box.w) + Math.max(0, box.x)) / 2;
    const text = state.labels.dropAudio;
    const textWidth = ctx.measureText(text).width;
    const icon = state.icon('drop-audio');
    if (icon) ctx.drawImage(icon, middle - textWidth / 2 - 17, box.y + box.h / 2 - 5.5, 11, 11);
    ctx.fillText(text, middle - textWidth / 2, box.y + box.h / 2 + 0.5);
  }

  for (const item of visible('audio')) {
    const live = liveOf(item);
    const clip = live?.audio ? { ...item.clip, ...live.audio } : item.clip;
    const chip = audioChip(clip, state.durationSec, pps, state.surfaceWidth / pps);
    const box = { x: x0 + chip.left, y: y0 + (live?.top ?? item.top), w: chip.width, h: item.height };
    const selected = state.selectedAudioId === item.id;
    const hovered = state.hoverId === item.id;
    const defaults = audioClipDefaults(clip);
    const bodyTop = box.y + CHIP_LABEL_H;
    const bodyH = box.h - CHIP_LABEL_H;
    dim(item.id);
    ctx.save();
    roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
    ctx.clip();
    ctx.fillStyle = selected ? colors.accentLabelSelected : colors.accentLabel;
    ctx.fillRect(box.x, box.y, box.w, CHIP_LABEL_H);
    // The body is the fades' own outline: the wave is cut to the shape the gain follows.
    ctx.save();
    fadeOutline(ctx, chip, box.x, bodyTop, bodyH);
    ctx.clip();
    ctx.fillStyle = selected ? colors.audioBodySelected : colors.audioBody;
    ctx.fillRect(box.x, bodyTop, box.w, bodyH);
    const peaks = clip.sig ? state.audioPeaks?.get(clip.sig) : undefined;
    if (peaks && peaks.length > 1 && clip.durationSec) {
      // The wave is the whole media at this zoom, shown from the clip's in-point.
      const per = peaks.length / clip.durationSec;
      const outSec = Number.isFinite(defaults.outSec) ? defaults.outSec : clip.durationSec;
      ctx.fillStyle = clip.muted ? colors.waveOff : colors.wave;
      drawWave(ctx, peaks, defaults.inSec * per, outSec * per, box.x, box.y + box.h, chip.contentWidth, bodyH, defaults.volumeDb, 0, state.width);
    }
    ctx.restore();
    // Label strip: what it is, struck through while it makes no sound, and its speed when not 1×.
    const glyph = state.icon(clip.muted ? 'audio-muted' : 'audio');
    if (glyph && box.w > 22) ctx.drawImage(glyph, box.x + 6, box.y + 2.5, 9, 9);
    const labelLeft = box.x + (box.w > 22 ? 19 : 6);
    ctx.font = `400 9.5px ${colors.font}`;
    ctx.fillStyle = clip.muted ? colors.ink4 : colors.ink2;
    const speed = defaults.speed !== 1 ? `${defaults.speed.toFixed(2).replace(/0$/, '')}×` : '';
    const label = fit(ctx, clip.label || state.labels.music, box.x + box.w - 24 - labelLeft - (speed ? 30 : 0));
    ctx.fillText(label, labelLeft, box.y + CHIP_LABEL_H / 2 + 0.5);
    const labelWidth = label ? ctx.measureText(label).width : 0;
    if (clip.muted && label) ctx.fillRect(labelLeft, box.y + CHIP_LABEL_H / 2, labelWidth, 1);
    if (speed && box.w > 80) {
      ctx.font = `400 9px ${colors.font}`;
      const speedWidth = ctx.measureText(speed).width + 8;
      ctx.fillStyle = colors.panelSoft;
      roundedRect(ctx, labelLeft + labelWidth + 4, box.y + 1, speedWidth, 12, 3);
      ctx.fill();
      ctx.fillStyle = colors.ink3;
      ctx.fillText(speed, labelLeft + labelWidth + 8, box.y + 7.5);
    }
    ctx.restore();
    frame(ctx, box.x, box.y, box.w, box.h, selected ? colors.accentInk : colors.audioLine);
    if (selected || hovered) {
      // Trim handles, then the fade knees on top of the body.
      const handle = Math.min(6, box.w / 2);
      ctx.fillStyle = selected ? colors.accentInk : colors.handleHover;
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, handle, box.h, [2, 0, 0, 2]);
      ctx.roundRect(box.x + box.w - handle, box.y, handle, box.h, [0, 2, 2, 0]);
      ctx.fill();
      if (selected) {
        ctx.fillStyle = colors.panel;
        ctx.fillRect(box.x + handle / 2 - 1, box.y + box.h / 4, 2, box.h / 2);
        ctx.fillRect(box.x + box.w - handle / 2 - 1, box.y + box.h / 4, 2, box.h / 2);
      }
      if (chip.knees) for (const at of [chip.knees.in, chip.knees.out]) {
        ctx.beginPath();
        ctx.arc(box.x + at, kneeY(box.y), KNEE_RADIUS - 1, 0, Math.PI * 2);
        ctx.fillStyle = colors.canvas;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = colors.accentInk;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (state.audioMute && chip.muteButton && (clip.muted || hovered)) {
      const side = MUTE_BUTTON.size;
      const left = box.x + box.w - MUTE_BUTTON.right - side;
      ctx.fillStyle = colors.panelStrong;
      roundedRect(ctx, left, box.y + MUTE_BUTTON.top, side, side, 2);
      ctx.fill();
      const sound = state.icon(clip.muted ? 'sound-off' : 'sound-on');
      if (sound) ctx.drawImage(sound, left + 1.5, box.y + MUTE_BUTTON.top + 1.5, 9, 9);
    }
    lit();
  }

  for (const item of visible('transition')) {
    const box = boxOf(item);
    const selected = state.selectedTransitionId === item.id;
    const hovered = state.hoverId === item.id;
    ctx.fillStyle = selected ? colors.accent : hovered ? colors.accentHover : colors.accentSoft;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const roomy = box.w >= 56;
    const glyph = box.w >= 16 ? state.icon(`transition:${item.transition.effect ?? ''}`) : null;
    ctx.font = `500 10px ${colors.font}`;
    ctx.fillStyle = colors.onAccent;
    if (roomy) {
      if (glyph) ctx.drawImage(glyph, box.x + 10, box.y + box.h / 2 - 5.5, 11, 11);
      ctx.fillText(fit(ctx, item.transition.label, box.w - (glyph ? 35 : 20)), box.x + (glyph ? 25 : 10), box.y + box.h / 2 + 0.5);
    } else if (glyph) ctx.drawImage(glyph, box.x + box.w / 2 - 5.5, box.y + box.h / 2 - 5.5, 11, 11);
    if (selected || hovered) {
      const grip = Math.min(8, box.w / 2);
      const bar = Math.min(10, box.h / 2);
      for (const left of [box.x, box.x + box.w - grip]) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(left, box.y, grip, box.h);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colors.onAccent;
        ctx.fillRect(left + grip / 2 - 1, box.y + (box.h - bar) / 2, 2, bar);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    if (selected) frame(ctx, box.x, box.y, box.w, box.h, colors.ink, 6);
  }

  for (const item of visible('pending')) {
    const box = boxOf(item);
    ctx.fillStyle = colors.badge;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 4);
    ctx.fill();
    ctx.setLineDash([4, 3]);
    frame(ctx, box.x, box.y, box.w, box.h, colors.pendingLine);
    ctx.setLineDash([]);
    ctx.font = `400 10px ${colors.font}`;
    ctx.fillStyle = colors.white;
    ctx.fillText(fit(ctx, item.range.label, box.w - 12), box.x + 6, box.y + box.h / 2 + 0.5);
  }

  ctx.restore();

  // The ruler stays at the top while the lanes scroll under it.
  ctx.fillStyle = colors.panel;
  ctx.fillRect(0, 0, width, metrics.rulerH);
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, metrics.rulerH - 1, width, 1);
  const step = rulerStep(pps);
  const minor = step * pps >= 40;
  ctx.font = `400 9px ${colors.font}`;
  for (let tick = Math.max(0, Math.floor(fromSec / step)); tick <= Math.min(Math.floor(state.durationSec / step), Math.ceil(toSec / step)); tick += 1) {
    const at = Math.round(X(tick * step));
    ctx.fillStyle = colors.line;
    ctx.fillRect(at, metrics.rulerH - 6, 1, 6);
    if (minor) { ctx.fillStyle = colors.lineSoft; ctx.fillRect(at + Math.round((step * pps) / 2), metrics.rulerH - 3, 1, 3); }
    ctx.fillStyle = colors.ink4;
    ctx.fillText(fmtTick(tick * step), at + 4, 8);
  }
}

/**
 * The layer over the clips: what follows the pointer or the clock. The playhead, the hover and snap
 * lines, a lifted clip's ghost, a new-lane line, a marquee and a drop plan are all a few strokes, and
 * they change many times a second; painted apart, they leave the lanes' picture alone.
 */
export function paintOverlay(ctx: CanvasRenderingContext2D, state: TimelinePaintState): void {
  const { colors, metrics, pps, width, height } = state;
  const x0 = originX(state);
  const y0 = tracksY(state);
  const X = (second: number) => x0 + second * pps;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, metrics.rulerH, width, height - metrics.rulerH);
  ctx.clip();

  const { ghost, line, marquee } = state.edit;
  if (line) {
    ctx.fillStyle = line.tone === 'media' ? colors.insertLine : colors.accent;
    if (line.tone === 'media') { ctx.shadowColor = colors.insertLine; ctx.shadowBlur = 6; }
    roundedRect(ctx, x0, y0 + line.top - 1, state.surfaceWidth, 2, 1);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  if (ghost) {
    // The lifted clip belongs to the pointer: its own size, free of any lane until it is let go.
    const still = ghost.item.kind === 'visual' && ghost.item.clip.kind === 'image';
    const box = { x: X(ghost.startSec), y: y0 + ghost.top, w: Math.max(20, (ghost.item.endSec - ghost.item.startSec) * pps), h: ghost.item.height };
    ctx.globalAlpha = 0.82;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = colors.panel;
    roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (ghost.item.kind === 'shot') {
      const { shot } = ghost.item;
      videoCard(ctx, state, box, { startSec: ghost.startSec, endSec: ghost.startSec + (ghost.item.endSec - ghost.item.startSec), sourceIn: shot.srcStart, sourceOut: shot.srcEnd,
        strip: shot.src ? state.clipStrips[shot.src] ?? [] : state.filmstrip, live: true, peaksKey: shot.src ?? 'main', volumeDb: shot.audioMuted ? WAVE_FLOOR_DB : shot.volumeDb ?? 0, muted: !!shot.audioMuted });
    } else {
      const { clip } = ghost.item;
      videoCard(ctx, state, box, { startSec: ghost.startSec, endSec: ghost.startSec + (ghost.item.endSec - ghost.item.startSec), sourceIn: clip.sourceInSec, sourceOut: clip.sourceOutSec,
        strip: still ? [] : clip.usePrimaryFilmstrip ? state.filmstrip : (clip.source ? state.clipStrips[clip.source] : undefined) ?? [], still: still ? clip.source : undefined, live: true,
        peaksKey: still ? undefined : clip.usePrimaryFilmstrip ? 'main' : clip.source, volumeDb: 0, muted: false });
      if (still && box.w > 46) badge(ctx, clip.label || state.labels.image, box.x + 4, box.y + box.h - 18, box.w, colors);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    roundedRect(ctx, box.x - 1, box.y - 1, box.w + 2, box.h + 2, RADIUS + 1);
    ctx.stroke();
  }
  const { drop } = state.edit;
  if (drop) {
    const at = X(drop.sec);
    if (drop.box) {
      const box = { x: at, y: y0 + drop.box.top, w: Math.max(28, drop.box.durationSec * pps), h: drop.box.height };
      ctx.fillStyle = colors.accentWash;
      roundedRect(ctx, box.x, box.y, box.w, box.h, RADIUS);
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = colors.accentStrong;
      ctx.lineWidth = 2;
      roundedRect(ctx, box.x + 1, box.y + 1, box.w - 2, box.h - 2, RADIUS);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = colors.accent;
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 8;
    ctx.fillRect(Math.round(at) - 1, metrics.rulerH, 2, height);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.font = `400 9px ${colors.font}`;
    const labelWidth = ctx.measureText(drop.label).width + 8;
    roundedRect(ctx, at + 6, Math.max(metrics.rulerH + 1, y0 - 2), labelWidth, 13, 3);
    ctx.fill();
    ctx.fillStyle = colors.onAccent;
    ctx.fillText(drop.label, at + 10, Math.max(metrics.rulerH + 1, y0 - 2) + 7);
  }
  if (state.insertingAtSec != null) {
    ctx.font = `400 10px ${colors.font}`;
    const labelWidth = ctx.measureText(state.labels.inserting).width + 12;
    const left = X(state.insertingAtSec) - labelWidth / 2;
    ctx.fillStyle = colors.badgeStrong;
    roundedRect(ctx, left, y0 + 8, labelWidth, 17, 4);
    ctx.fill();
    ctx.fillStyle = colors.white;
    ctx.fillText(state.labels.inserting, left + 6, y0 + 17);
  }
  if (marquee) {
    const box = { x: x0 + marquee.left, y: y0 + marquee.top, w: Math.max(1, marquee.right - marquee.left), h: Math.max(1, marquee.bottom - marquee.top) };
    ctx.fillStyle = colors.marquee;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 2);
    ctx.fill();
    frame(ctx, box.x, box.y, box.w, box.h, colors.marqueeLine, 2);
  }

  if (state.guideSec != null) {
    ctx.fillStyle = colors.accent;
    ctx.fillRect(Math.round(X(state.guideSec)), metrics.rulerH, 1, height);
  }
  // The hover guide yields where it would sit on the playhead.
  if (state.hoverSec != null && (state.framePick || Math.abs(state.hoverSec - state.playheadSec) * pps > 8)) {
    ctx.fillStyle = state.framePick ? colors.accent : colors.hover;
    ctx.fillRect(Math.round(X(state.hoverSec)), metrics.rulerH, 1, height);
  }
  ctx.restore();

  if (state.framePick && state.hoverSec != null) {
    ctx.font = `400 9px ${colors.monoFont}`;
    ctx.fillStyle = colors.ink;
    ctx.fillText(`${state.hoverSec.toFixed(2)}s`, X(state.hoverSec) + 6, 9);
  }

  const playheadX = X(state.playheadSec);
  if (playheadX > -6 && playheadX < width + 6) {
    ctx.fillStyle = colors.playhead;
    ctx.fillRect(Math.round(playheadX) - 1, 0, 2, height);
    ctx.beginPath();
    ctx.moveTo(playheadX - 4, 0);
    ctx.lineTo(playheadX + 4, 0);
    ctx.lineTo(playheadX, 6);
    ctx.closePath();
    ctx.fill();
  }
}
