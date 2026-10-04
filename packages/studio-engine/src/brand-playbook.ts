import type { CaptionStyle } from './composition-core';

/**
 * B — a creator's own editing playbook, produced by the extraction method A (brand-method.ts) from
 * their published videos. It says how this creator edits: what they always do (fixed habits, run
 * as parameters), which moves they use and when (a repertoire the edit planner draws on per moment),
 * how their videos are built (structure), and what generated material looks like (generation
 * prompts). Every entry carries its evidence. Things decided by the footage, the platform or the
 * moment — aspect ratio, shot sizes, per-video counts — are never in a playbook.
 */
export const PLAYBOOK_SCHEMA = 1;

export type BrandPlatform = 'douyin' | 'tiktok' | 'youtube' | 'bilibili' | 'xiaohongshu' | 'upload';
export type Confidence = 'high' | 'medium' | 'low';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface Box { x: number; y: number; w: number; h: number }

/** A durable media file the brand owns (content-addressed cloud key, never a temporary URL). */
export interface BrandAsset { key: string; kind: 'image' | 'video'; width: number; height: number; durationSec?: number }

/** Where a conclusion came from: the videos it holds in, frames that show it, how sure it is. */
export interface Evidence { videos: string[]; frames?: { video: string; sec: number; key?: string }[]; confidence: Confidence }

/** A rule in the creator's language, with the English the models read. */
export interface Rule { text: string; en: string; evidence?: Evidence }

/** A text band the creator repeats (held headline, opening label): place and look; words per video. */
export interface TextBand { box: Box; color: string; plate: string | null; sizePct: number; reference?: BrandAsset; evidence?: Evidence }

/** What the creator always does — executed as is. Absent = the videos show no stable habit. */
export interface FixedHabits {
  captions?: {
    /** False: their videos carry no burned-in captions. */
    on: boolean;
    style?: Partial<CaptionStyle>;
    /** Characters (CJK) or words (Latin) on screen at once. */
    perScreen?: number;
    upper?: boolean;
    /** Key words marked: which rule (keywords / numbers / current word). */
    accent?: 'keywords' | 'numbers' | 'current_word' | null;
    evidence?: Evidence;
  };
  bands?: { header?: TextBand; hookLabel?: TextBand & { durationSec: number } };
  /** Vertical template frame: footage in `window`, the rest `fill`. */
  frame?: { window: Box; fill: string; evidence?: Evidence };
  logo?: BrandAsset & { corner: Corner; widthPct: number; opacity: number; evidence?: Evidence };
  intro?: BrandAsset & { evidence?: Evidence };
  outro?: BrandAsset & { evidence?: Evidence };
  palette?: { accent?: string; accent2?: string; text?: string; ground?: string; evidence?: Evidence };
  fonts?: { heading?: string; body?: string };
  loudness?: { lufs: number; evidence?: Evidence };
  pauses?: { mode: 'tight' | 'moderate' | 'natural'; evidence?: Evidence };
}

export const MOVE_KINDS = ['punch_in', 'transition', 'broll', 'multicam', 'sfx', 'graphic_callout', 'sticker', 'music'] as const;
export type MoveKind = typeof MOVE_KINDS[number];
/** The variants a move can take, as the engine names them. */
export const MOVE_VARIANTS: Record<MoveKind, readonly string[]> = {
  punch_in: ['punch', 'instant', 'slow-push', 'in-out'],
  transition: ['whip', 'zoom', 'flash', 'glitch', 'fade', 'sfx_hit'],
  broll: ['own_footage', 'product', 'screen_recording', 'screenshot', 'stock', 'archival', 'ai_image', 'meme'],
  multicam: ['second_angle', 'reaction'],
  sfx: ['whoosh', 'pop', 'ding', 'riser', 'impact'],
  graphic_callout: ['arrow', 'circle', 'highlight_box', 'zoomed_screenshot', 'number_card', 'chart', 'lower_third', 'price_tag'],
  sticker: ['emoji', 'meme', 'sticker'],
  music: ['bed', 'intro_outro', 'sections'],
};
export type Frequency = 'rare' | 'moderate' | 'frequent';

/** A move the creator uses: which variants, how often (a level and a cap, never a fixed rate), and
 *  when — the trigger the planner matches against each moment of a new video. */
export interface Move {
  kind: MoveKind;
  variants: string[];
  frequency: Frequency;
  maxPerMin?: number;
  trigger: Rule;
  /** Kind-specific settings the engine needs (e.g. punch-in scale, music level below voice). */
  settings?: Record<string, number | string | boolean>;
  evidence?: Evidence;
}

/** How their videos are built: defaults a single video may depart from. */
export interface Structure {
  opening?: Rule;
  closing?: Rule;
  /** Body pace as a range of cuts per minute (the moment decides the actual cuts). */
  pace?: { cutsPerMin: [number, number]; evidence?: Evidence };
  /** Other recurring structure (chaptering, recap, call to action). */
  rules: Rule[];
}

/** What generated material looks like — prompts, with references. */
export interface Generation {
  cover?: { layout: Rule; lettering: Rule; references: BrandAsset[] };
  /** How their headlines read, with real ones. */
  headlines?: { manner: Rule; examples: string[] };
  /** Titles, cards, stickers and other generated elements: look and motion. */
  elements?: Rule[];
}

export interface BrandPlaybook {
  schema: typeof PLAYBOOK_SCHEMA;
  id: string;
  name: string;
  /** Document revision (each save increments). */
  version: number;
  /** The extraction method version that produced it; 'manual' for a hand-made brand. */
  method: string;
  source: { platform: BrandPlatform; account?: string; videos: { id: string; title?: string; sourceUrl?: string; durationSec: number; coverKey?: string }[] };
  /** The style in a few sentences, and its English for the models. */
  portrait: Rule;
  fixed: FixedHabits;
  moves: Move[];
  structure: Structure;
  generation: Generation;
}

/** What a scene keeps: a copy taken when picked, so later edits never restyle past projects. */
export type PlaybookSnapshot = Omit<BrandPlaybook, 'source'>;
export function playbookSnapshot(playbook: BrandPlaybook): PlaybookSnapshot {
  const { source: _source, ...snapshot } = structuredClone(playbook);
  return snapshot;
}

export function emptyPlaybook(id: string, name: string, platform: BrandPlatform = 'upload'): BrandPlaybook {
  return { schema: PLAYBOOK_SCHEMA, id, name, version: 1, method: 'manual', source: { platform, videos: [] }, portrait: { text: '', en: '' }, fixed: {}, moves: [], structure: { rules: [] }, generation: {} };
}

/** The move of a kind, when the creator uses it. */
export const moveOf = (playbook: Pick<BrandPlaybook, 'moves'>, kind: MoveKind) => playbook.moves.find(move => move.kind === kind);

// ── Validation: one validator for server and client; a bad playbook is refused with the field, never patched.

const HEX = /^#[0-9a-f]{6}$/i;
function fail(path: string, reason: string): never { throw new Error(`品牌字段无效：${path}（${reason}）`); }
const isObject = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
function box(value: unknown, path: string) {
  const b = value as Box;
  if (!isObject(value) || ![b.x, b.y, b.w, b.h].every(n => typeof n === 'number' && n >= 0 && n <= 1) || b.w <= 0 || b.h <= 0 || b.x + b.w > 1.001 || b.y + b.h > 1.001) fail(path, '需要 0–1 的矩形');
}
function asset(value: unknown, path: string) {
  const a = value as BrandAsset;
  if (!isObject(value) || typeof a.key !== 'string' || !a.key || /^(blob|data):/.test(a.key)) fail(path, '需要持久化的素材 key');
  if (a.kind !== 'image' && a.kind !== 'video') fail(path, 'kind 只能是 image 或 video');
  if (!(a.width > 0) || !(a.height > 0)) fail(path, '缺少尺寸');
  if (a.kind === 'video' && !(a.durationSec! > 0)) fail(path, '视频缺少时长');
}
function rule(value: unknown, path: string) {
  const r = value as Rule;
  if (!isObject(value) || typeof r.text !== 'string' || typeof r.en !== 'string' || r.text.length > 2000 || r.en.length > 2000) fail(path, '需要 text 与 en');
}
function color(value: unknown, path: string) { if (typeof value !== 'string' || !HEX.test(value)) fail(path, '需要 #RRGGBB'); }

export function validatePlaybook(value: unknown): BrandPlaybook {
  const p = value as BrandPlaybook;
  if (!isObject(value)) fail('', '不是对象');
  if (p.schema !== PLAYBOOK_SCHEMA) fail('schema', `需要 ${PLAYBOOK_SCHEMA}`);
  if (typeof p.id !== 'string' || !p.id) fail('id', '缺失');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) fail('name', '1–60 字');
  if (!Number.isInteger(p.version) || p.version < 1) fail('version', '正整数');
  if (typeof p.method !== 'string' || !p.method) fail('method', '缺失');
  if (!isObject(p.source) || !Array.isArray(p.source.videos) || p.source.videos.length > 30) fail('source', '最多 30 条作品');
  rule(p.portrait, 'portrait');
  if (!isObject(p.fixed)) fail('fixed', '缺失');
  const f = p.fixed;
  if (f.captions) { if (typeof f.captions.on !== 'boolean') fail('fixed.captions.on', '布尔'); for (const key of ['color', 'accentColor', 'strokeColor'] as const) { const c = f.captions.style?.[key]; if (c != null) color(c, `fixed.captions.style.${key}`); } }
  for (const key of ['header', 'hookLabel'] as const) {
    const band = f.bands?.[key];
    if (!band) continue;
    box(band.box, `fixed.bands.${key}.box`); color(band.color, `fixed.bands.${key}.color`);
    if (band.plate !== null) color(band.plate, `fixed.bands.${key}.plate`);
    if (!(band.sizePct > 0 && band.sizePct <= 0.3)) fail(`fixed.bands.${key}.sizePct`, '0–0.3');
    if (band.reference) asset(band.reference, `fixed.bands.${key}.reference`);
  }
  if (f.bands?.hookLabel && !(f.bands.hookLabel.durationSec > 0 && f.bands.hookLabel.durationSec <= 15)) fail('fixed.bands.hookLabel.durationSec', '0–15 秒');
  if (f.frame) { box(f.frame.window, 'fixed.frame.window'); color(f.frame.fill, 'fixed.frame.fill'); }
  if (f.logo) {
    asset(f.logo, 'fixed.logo');
    if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(f.logo.corner)) fail('fixed.logo.corner', '四角之一');
    if (!(f.logo.widthPct > 0 && f.logo.widthPct <= 40)) fail('fixed.logo.widthPct', '0–40');
    if (!(f.logo.opacity > 0 && f.logo.opacity <= 1)) fail('fixed.logo.opacity', '0–1');
  }
  if (f.intro) { asset(f.intro, 'fixed.intro'); if (f.intro.kind !== 'video') fail('fixed.intro', '片头需要视频'); }
  if (f.outro) { asset(f.outro, 'fixed.outro'); if (f.outro.kind !== 'video') fail('fixed.outro', '片尾需要视频'); }
  for (const key of ['accent', 'accent2', 'text', 'ground'] as const) { const c = f.palette?.[key]; if (c != null) color(c, `fixed.palette.${key}`); }
  if (f.loudness && !(f.loudness.lufs >= -40 && f.loudness.lufs <= -5)) fail('fixed.loudness.lufs', '-40…-5');
  if (f.pauses && !['tight', 'moderate', 'natural'].includes(f.pauses.mode)) fail('fixed.pauses.mode', 'tight/moderate/natural');
  if (!Array.isArray(p.moves) || p.moves.length > MOVE_KINDS.length) fail('moves', '招式列表');
  const kinds = new Set<string>();
  p.moves.forEach((move, index) => {
    const path = `moves.${index}`;
    if (!MOVE_KINDS.includes(move.kind)) fail(`${path}.kind`, MOVE_KINDS.join('/'));
    if (kinds.has(move.kind)) fail(`${path}.kind`, '同一招式只能出现一次');
    kinds.add(move.kind);
    if (!Array.isArray(move.variants) || !move.variants.length || move.variants.some(v => !MOVE_VARIANTS[move.kind].includes(v))) fail(`${path}.variants`, MOVE_VARIANTS[move.kind].join('/'));
    if (!['rare', 'moderate', 'frequent'].includes(move.frequency)) fail(`${path}.frequency`, 'rare/moderate/frequent');
    if (move.maxPerMin !== undefined && !(move.maxPerMin > 0 && move.maxPerMin <= 60)) fail(`${path}.maxPerMin`, '0–60');
    rule(move.trigger, `${path}.trigger`);
  });
  if (!isObject(p.structure) || !Array.isArray(p.structure.rules)) fail('structure', '缺失');
  if (p.structure.opening) rule(p.structure.opening, 'structure.opening');
  if (p.structure.closing) rule(p.structure.closing, 'structure.closing');
  p.structure.rules.forEach((item, index) => rule(item, `structure.rules.${index}`));
  if (p.structure.pace && !(Array.isArray(p.structure.pace.cutsPerMin) && p.structure.pace.cutsPerMin.length === 2 && p.structure.pace.cutsPerMin[0] >= 0 && p.structure.pace.cutsPerMin[1] >= p.structure.pace.cutsPerMin[0])) fail('structure.pace', '每分钟刀数区间');
  if (!isObject(p.generation)) fail('generation', '缺失');
  if (p.generation.cover) { rule(p.generation.cover.layout, 'generation.cover.layout'); rule(p.generation.cover.lettering, 'generation.cover.lettering'); p.generation.cover.references.forEach((item, index) => asset(item, `generation.cover.references.${index}`)); }
  if (p.generation.headlines) { rule(p.generation.headlines.manner, 'generation.headlines.manner'); if (!Array.isArray(p.generation.headlines.examples)) fail('generation.headlines.examples', '列表'); }
  p.generation.elements?.forEach((item, index) => rule(item, `generation.elements.${index}`));
  return p;
}

/** A scene's copy: the same shape without the source list. */
export function validatePlaybookSnapshot(value: unknown): PlaybookSnapshot {
  validatePlaybook({ ...(value as object), source: { platform: 'upload', videos: [] } });
  return value as PlaybookSnapshot;
}
