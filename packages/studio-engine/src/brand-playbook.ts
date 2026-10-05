import type { CaptionStyle } from './composition-core';

/**
 * A creator's brand: one prompt made of XML blocks, produced from their own videos by the extraction
 * method (brand-method.ts) and edited by them. A few blocks are fixed — captions, logo, colours, fonts,
 * sound, intro and outro — and carry exact values the engine applies as they are. Every other block is
 * prose for the models that edit and generate: how titles and layout look, how the creator uses the
 * platform's editing moves, what their motion graphics look like, how their videos are built, and their
 * cover. The platform's moves (punch-ins, transitions, B-roll, sound effects, motion graphics) are not
 * listed here: they are capabilities every brand has, and a block only says how this creator uses them.
 */
export const PLAYBOOK_SCHEMA = 2;

export type BrandPlatform = 'douyin' | 'tiktok' | 'youtube' | 'bilibili' | 'xiaohongshu' | 'upload';
export type Confidence = 'high' | 'medium' | 'low';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** A durable media file the brand owns (content-addressed cloud key, never a temporary URL). */
export interface BrandAsset { key: string; kind: 'image' | 'video'; width: number; height: number; durationSec?: number }

/** Where a block came from: the videos it holds in, frames that show it, how sure it is. */
export interface Evidence { videos: string[]; frames?: { video: string; sec: number; key?: string }[]; confidence: Confidence }

/** A block's prose, in the creator's language, as the models read it. */
export interface Prose { text?: string; evidence?: Evidence }

/** The cover prompt: `frame` picks the still from the new video, `headline` says how its words are
 *  written (from what the video says), `design` turns the still and the words into the cover. */
export interface BrandCover {
  /** Where the person on the cover comes from: a still of the video, or a photo taken for covers (a
   *  cut-out studio portrait, another outfit or light) — then a new cover is built on such a photo. */
  source?: 'video' | 'photo';
  frame?: string; headline?: string; design?: string;
  /** Past covers: the style, and the person when `source` is 'photo'. */
  references?: BrandAsset[];
  /** Photos of the creator taken for covers, added by them; used before a past cover's person. */
  portraits?: BrandAsset[];
  evidence?: Evidence;
}

/** The blocks, in the order the prompt renders them. */
export interface BrandBlocks {
  /** The style in a few sentences. */
  portrait?: Prose;
  /** Fixed: burned-in captions (look applied by the engine; prose for what the values cannot say). */
  captions?: Prose & { on: boolean; style?: Partial<CaptionStyle>; accent?: 'keywords' | 'numbers' | 'current_word' | null };
  /** Fixed: a mark held in one corner. */
  logo?: BrandAsset & { corner: Corner; widthPct: number; opacity: number; evidence?: Evidence };
  /** Fixed: colours of the creator's own text and graphics. */
  palette?: { accent?: string; accent2?: string; text?: string; ground?: string; evidence?: Evidence };
  /** Fixed: fonts for titles and generated elements (font ids); prose for how the faces look (and what
   *  they are taken to be) where an id is only the closest face the platform has. */
  fonts?: { heading?: string; body?: string; text?: string; evidence?: Evidence };
  /** Fixed: loudness and pause trimming; prose for music and sound-effect habits. */
  sound?: Prose & { lufs?: number; pauses?: 'tight' | 'moderate' | 'natural' };
  /** Fixed: the same clip before / after every video. */
  bookends?: { intro?: BrandAsset; outro?: BrandAsset; evidence?: Evidence };
  /** Titles, labels, bands and frames on screen, with reference stills. */
  layout?: Prose & { references?: BrandAsset[] };
  /** How the creator uses the platform's editing moves, and on what moments. */
  editing?: Prose;
  /** The look and motion of their motion graphics, with reference stills. */
  motion_graphics?: Prose & { references?: BrandAsset[] };
  /** How a video opens, unfolds and closes. */
  structure?: Prose;
  /** The cover for a new video, as its own prompt in three parts — which still of the video to build on,
   *  how the headline is worded, and how still and words become the cover — with past covers as references. */
  cover?: BrandCover;
}
export type BlockId = keyof BrandBlocks;
export const BLOCK_IDS: readonly BlockId[] = ['portrait', 'captions', 'logo', 'palette', 'fonts', 'sound', 'bookends', 'layout', 'editing', 'motion_graphics', 'structure', 'cover'];
/** Blocks whose values the engine applies as they are. */
export const FIXED_BLOCKS: readonly BlockId[] = ['captions', 'logo', 'palette', 'fonts', 'sound', 'bookends'];

export interface BrandPlaybook {
  schema: typeof PLAYBOOK_SCHEMA;
  id: string;
  name: string;
  /** Document revision (each save increments). */
  version: number;
  /** The extraction method version that produced it; 'manual' for a hand-made brand. */
  method: string;
  source: {
    platform: BrandPlatform; account?: string;
    /** The source videos; width and height are the footage's (recorded since 2026-10). */
    videos: { id: string; title?: string; sourceUrl?: string; durationSec: number; coverKey?: string; width?: number; height?: number }[];
    /** A clean frame of the creator's own footage (no captions or titles) for previews; `cleaned` = its
     *  text was removed by image editing because no frame was clean; `textLeft`: editing could not remove
     *  the captions, so this is the original frame with its text. UI only, never part of the prompt. */
    preview?: BrandAsset & { cleaned: boolean; textLeft?: boolean };
  };
  blocks: BrandBlocks;
}

/**
 * The canvas the creator's footage is cut on (width 1080, as scene canvases are): the shape of their
 * videos, else of the preview still, else vertical. Previews draw the brand on it; it is never part of
 * the brand, which applies to footage of any shape.
 */
export function brandCanvas(playbook: Pick<BrandPlaybook, 'source'>): { width: number; height: number } {
  const ratios = playbook.source.videos.flatMap(video => video.width && video.height ? [video.height / video.width] : []).sort((a, b) => a - b);
  const preview = playbook.source.preview;
  const ratio = ratios.length ? ratios[Math.floor(ratios.length / 2)]! : preview ? preview.height / preview.width : 16 / 9;
  return { width: 1080, height: Math.max(2, Math.round(1080 * ratio / 2) * 2) };
}

/** What a scene keeps: a copy taken when picked, so later edits never restyle past projects. */
export type PlaybookSnapshot = Omit<BrandPlaybook, 'source'>;
export function playbookSnapshot(playbook: BrandPlaybook): PlaybookSnapshot {
  const { source: _source, ...snapshot } = structuredClone(playbook);
  return snapshot;
}

export function emptyPlaybook(id: string, name: string, platform: BrandPlatform = 'upload'): BrandPlaybook {
  return { schema: PLAYBOOK_SCHEMA, id, name, version: 1, method: 'manual', source: { platform, videos: [] }, blocks: {} };
}

// ── The prompt

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string | number | boolean) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function element(tag: string, attrs: Record<string, string | number | boolean | null | undefined>, text?: string): string {
  const pairs = Object.entries(attrs).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => ` ${key}="${escapeAttr(value as string | number | boolean)}"`).join('');
  const body = text?.trim();
  return body ? `<${tag}${pairs}>\n${escapeText(body)}\n</${tag}>` : `<${tag}${pairs}/>`;
}

/**
 * The brand as the prompt the models read: one XML block per part, fixed values as attributes, prose as
 * content. `only` picks the blocks a consumer needs (an edit planner needs no cover). Reference images
 * travel separately; a block says how many it has. Deterministic, so a prompt prefix stays cacheable.
 */
export function renderBrandPrompt(playbook: Pick<BrandPlaybook, 'name' | 'blocks'>, only?: readonly BlockId[]): string {
  const b = playbook.blocks;
  const want = (id: BlockId) => (!only || only.includes(id)) && b[id] !== undefined;
  const refs = (list: BrandAsset[] | undefined) => list?.length ? list.length : undefined;
  const parts: string[] = [];
  if (want('portrait')) parts.push(element('portrait', {}, b.portrait!.text));
  if (want('captions')) {
    const c = b.captions!; const s = c.style ?? {};
    parts.push(element('captions', c.on ? { on: true, color: s.color, stroke: s.strokeColor, plate: s.bg, bold: s.bold, accent: c.accent ?? undefined, 'accent-color': s.accentColor, 'bottom-edge': s.yPct !== undefined ? `${s.yPct}% from top` : undefined } : { on: false }, c.text));
  }
  if (want('logo')) parts.push(element('logo', { corner: b.logo!.corner, width: `${b.logo!.widthPct}%`, opacity: b.logo!.opacity }));
  if (want('palette')) { const p = b.palette!; parts.push(element('palette', { accent: p.accent, 'accent-2': p.accent2, text: p.text, ground: p.ground })); }
  if (want('fonts')) parts.push(element('fonts', { heading: b.fonts!.heading, body: b.fonts!.body }, b.fonts!.text));
  if (want('sound')) parts.push(element('sound', { loudness: b.sound!.lufs !== undefined ? `${b.sound!.lufs} LUFS` : undefined, pauses: b.sound!.pauses }, b.sound!.text));
  if (want('bookends')) parts.push(element('bookends', { intro: b.bookends!.intro ? `${b.bookends!.intro.durationSec ?? ''}s clip` : undefined, outro: b.bookends!.outro ? `${b.bookends!.outro.durationSec ?? ''}s clip` : undefined }));
  if (want('layout')) parts.push(element('layout', { references: refs(b.layout!.references) }, b.layout!.text));
  if (want('editing')) parts.push(element('editing', {}, b.editing!.text));
  if (want('motion_graphics')) parts.push(element('motion_graphics', { references: refs(b.motion_graphics!.references) }, b.motion_graphics!.text));
  if (want('structure')) parts.push(element('structure', {}, b.structure!.text));
  if (want('cover')) parts.push(coverElement(b.cover!, refs(b.cover!.references)));
  return `<brand name="${escapeAttr(playbook.name)}">\n${parts.join('\n')}\n</brand>`;
}

/** <cover> holds its parts as child elements: <frame> (which still), <headline> (how the words are written)
 *  and <design> (how still and words become the cover). */
function coverElement(cover: BrandCover, references: number | undefined): string {
  const inner = (['frame', 'headline', 'design'] as const).flatMap(part => cover[part]?.trim() ? [element(part, {}, cover[part])] : []).join('\n');
  const attrs = `${cover.source ? ` person="${cover.source === 'photo' ? 'a photo taken for covers' : 'a still of the video'}"` : ''}${references ? ` references="${references}"` : ''}`;
  return inner ? `<cover${attrs}>\n${inner}\n</cover>` : `<cover${attrs}/>`;
}

/** Whether a prose block says anything. */
export const hasText = (block: Prose | undefined) => !!block?.text?.trim();

// ── Validation: one validator for server and client; a bad brand is refused with the field, never patched.

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 4000;
function fail(path: string, reason: string): never { throw new Error(`品牌字段无效：${path}（${reason}）`); }
const isObject = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
function asset(value: unknown, path: string) {
  const a = value as BrandAsset;
  if (!isObject(value) || typeof a.key !== 'string' || !a.key || /^(blob|data):/.test(a.key)) fail(path, '需要持久化的素材 key');
  if (a.kind !== 'image' && a.kind !== 'video') fail(path, 'kind 只能是 image 或 video');
  if (!(a.width > 0) || !(a.height > 0)) fail(path, '缺少尺寸');
  if (a.kind === 'video' && !(a.durationSec! > 0)) fail(path, '视频缺少时长');
}
function prose(value: unknown, path: string) {
  if (!isObject(value)) fail(path, '需要对象');
  const text = (value as Prose).text;
  if (text !== undefined && (typeof text !== 'string' || text.length > MAX_TEXT)) fail(`${path}.text`, `最多 ${MAX_TEXT} 字`);
}
function references(value: unknown, path: string) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 8) fail(path, '最多 8 张参考图');
  value.forEach((item, index) => asset(item, `${path}.${index}`));
}
function color(value: unknown, path: string) { if (value !== undefined && value !== null && (typeof value !== 'string' || !HEX.test(value))) fail(path, '需要 #RRGGBB'); }

export function validatePlaybook(value: unknown): BrandPlaybook {
  const p = value as BrandPlaybook;
  if (!isObject(value)) fail('', '不是对象');
  if (p.schema !== PLAYBOOK_SCHEMA) fail('schema', `需要 ${PLAYBOOK_SCHEMA}`);
  if (typeof p.id !== 'string' || !p.id) fail('id', '缺失');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) fail('name', '1–60 字');
  if (!Number.isInteger(p.version) || p.version < 1) fail('version', '正整数');
  if (typeof p.method !== 'string' || !p.method) fail('method', '缺失');
  if (!isObject(p.source) || !Array.isArray(p.source.videos) || p.source.videos.length > 30) fail('source', '最多 30 条作品');
  if (p.source.preview) { asset(p.source.preview, 'source.preview'); if (p.source.preview.kind !== 'image' || typeof p.source.preview.cleaned !== 'boolean') fail('source.preview', '需要图片与 cleaned'); }
  if (!isObject(p.blocks)) fail('blocks', '缺失');
  const b = p.blocks;
  for (const key of Object.keys(b)) if (!BLOCK_IDS.includes(key as BlockId)) fail(`blocks.${key}`, '未知的块');
  for (const id of ['portrait', 'editing', 'structure'] as const) if (b[id]) prose(b[id], `blocks.${id}`);
  for (const id of ['layout', 'motion_graphics'] as const) if (b[id]) { prose(b[id], `blocks.${id}`); references(b[id]!.references, `blocks.${id}.references`); }
  if (b.cover) {
    if (!isObject(b.cover)) fail('blocks.cover', '需要对象');
    for (const key of ['frame', 'headline', 'design'] as const) if (b.cover[key] !== undefined && (typeof b.cover[key] !== 'string' || b.cover[key]!.length > MAX_TEXT)) fail(`blocks.cover.${key}`, `最多 ${MAX_TEXT} 字`);
    references(b.cover.references, 'blocks.cover.references');
    references(b.cover.portraits, 'blocks.cover.portraits');
    if (b.cover.source !== undefined && b.cover.source !== 'video' && b.cover.source !== 'photo') fail('blocks.cover.source', 'video 或 photo');
  }
  if (b.captions) {
    prose(b.captions, 'blocks.captions');
    if (typeof b.captions.on !== 'boolean') fail('blocks.captions.on', '布尔');
    for (const key of ['color', 'accentColor', 'strokeColor', 'bg'] as const) color(b.captions.style?.[key], `blocks.captions.style.${key}`);
  }
  if (b.logo) {
    asset(b.logo, 'blocks.logo');
    if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(b.logo.corner)) fail('blocks.logo.corner', '四角之一');
    if (!(b.logo.widthPct > 0 && b.logo.widthPct <= 40)) fail('blocks.logo.widthPct', '0–40');
    if (!(b.logo.opacity > 0 && b.logo.opacity <= 1)) fail('blocks.logo.opacity', '0–1');
  }
  if (b.palette) for (const key of ['accent', 'accent2', 'text', 'ground'] as const) color(b.palette[key], `blocks.palette.${key}`);
  if (b.fonts) {
    for (const key of ['heading', 'body'] as const) if (b.fonts[key] !== undefined && (typeof b.fonts[key] !== 'string' || b.fonts[key]!.length > 80)) fail(`blocks.fonts.${key}`, '字体 id');
    prose(b.fonts, 'blocks.fonts');
  }
  if (b.sound) {
    prose(b.sound, 'blocks.sound');
    if (b.sound.lufs !== undefined && !(b.sound.lufs >= -40 && b.sound.lufs <= -5)) fail('blocks.sound.lufs', '-40…-5');
    if (b.sound.pauses !== undefined && !['tight', 'moderate', 'natural'].includes(b.sound.pauses)) fail('blocks.sound.pauses', 'tight/moderate/natural');
  }
  if (b.bookends) {
    if (b.bookends.intro) { asset(b.bookends.intro, 'blocks.bookends.intro'); if (b.bookends.intro.kind !== 'video') fail('blocks.bookends.intro', '片头需要视频'); }
    if (b.bookends.outro) { asset(b.bookends.outro, 'blocks.bookends.outro'); if (b.bookends.outro.kind !== 'video') fail('blocks.bookends.outro', '片尾需要视频'); }
  }
  return p;
}

/** A scene's copy: the same shape without the source list. */
export function validatePlaybookSnapshot(value: unknown): PlaybookSnapshot {
  validatePlaybook({ ...(value as object), source: { platform: 'upload', videos: [] } });
  return value as PlaybookSnapshot;
}
