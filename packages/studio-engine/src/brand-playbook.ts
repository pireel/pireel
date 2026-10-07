import type { CaptionStyle } from './composition-core';
import { BASE_CAPTION_FONT_PX } from './caption-presets';
import { BRAND_EDITING_SKILL_IDS } from './editing-skills';

/**
 * A creator's brand: one prompt made of XML blocks, produced from their own videos by the extraction
 * method (brand-method.ts) and edited by them. A few blocks are fixed — captions, logo, colours, sound,
 * intro and outro, and the overlay-text font — and carry exact values the engine applies as they are. Every other block is
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

/** The cover prompt, in two parts: `frame` says which still of the new video to pick, `design` how that
 *  still becomes the cover — its headline (how it is worded and lettered) among the rest. */
export interface BrandCover {
  frame?: string; design?: string;
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
  /** Overlay text (花字): the words the creator puts on screen besides captions — titles, labels, emphasis
   *  words, text in graphics. Fixed: its font (the closest face the platform has; `fontLike` names the
   *  original). Prose: how it looks and moves and when it is used, with reference stills. */
  overlay_text?: Prose & { font?: string; fontLike?: string; references?: BrandAsset[] };
  /** Fixed: loudness and pause trimming. */
  sound?: { lufs?: number; pauses?: 'tight' | 'moderate' | 'natural'; evidence?: Evidence };
  /** The visual language: how the picture is organised and changes — where the speaker sits, bands and
   *  frames, picture in picture, split screens — and how the creator uses the platform's moves on it. */
  visual?: Prose & { references?: BrandAsset[] };
  /** Motion graphics, ready-made components among them: their style in prose — how colours and type are
   *  chosen for a video's picture and topic, never values — with reference stills. */
  graphics?: Prose & { references?: BrandAsset[] };
  /** How a video opens, unfolds and closes. */
  structure?: Prose;
  /** The cover for a new video, as its own prompt in two parts — which still of the video to build on, and
   *  how that still becomes the cover. */
  cover?: BrandCover;
}
export type BlockId = keyof BrandBlocks;
export const BLOCK_IDS: readonly BlockId[] = ['portrait', 'captions', 'overlay_text', 'logo', 'sound', 'visual', 'graphics', 'structure', 'cover'];
/** Blocks whose values the engine applies as they are. */
export const FIXED_BLOCKS: readonly BlockId[] = ['captions', 'logo', 'sound'];

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
  /** Editing skills a project edited with this brand starts with (ids from editing-skills), until the
   *  creator sets the project's own; the analysis sets them, the creator edits them. */
  skills?: string[];
  /** The Studio Skill (kind of video) this brand is a style of; read through brandSkillOf. */
  skillId?: string;
}

/** The Studio Skills a brand can belong to: only talking-head videos for now. A project on any other
 *  Skill (or the creator's own) is edited without a brand. */
export const BRAND_SKILL_IDS: readonly string[] = ['talking-head-edit'];
export const DEFAULT_BRAND_SKILL_ID = 'talking-head-edit';
/** The Skill a brand belongs to (brands made before skills were recorded are talking-head brands). */
export const brandSkillOf = (brand: Pick<BrandPlaybook, 'skillId'>) => brand.skillId ?? DEFAULT_BRAND_SKILL_ID;
export const skillTakesBrand = (skillId: string | undefined) => !!skillId && BRAND_SKILL_IDS.includes(skillId);

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
    // Size as the engine draws it: font px on a frame 1080 wide.
    parts.push(element('captions', c.on ? { on: true, font: s.font, size: s.scale !== undefined ? `${Math.round(s.scale * BASE_CAPTION_FONT_PX)}px on a 1080-wide frame` : undefined, color: s.color, stroke: s.strokeColor, plate: s.bg, bold: s.bold, accent: c.accent ?? undefined, 'accent-color': s.accentColor, 'bottom-edge': s.yPct !== undefined ? `${s.yPct}% from top` : undefined } : { on: false }, c.text));
  }
  if (want('overlay_text')) parts.push(element('overlay_text', { font: b.overlay_text!.font, like: b.overlay_text!.fontLike, references: refs(b.overlay_text!.references) }, b.overlay_text!.text));
  if (want('logo')) parts.push(element('logo', { corner: b.logo!.corner, width: `${b.logo!.widthPct}%`, opacity: b.logo!.opacity }));
  if (want('sound')) parts.push(element('sound', { loudness: b.sound!.lufs !== undefined ? `${b.sound!.lufs} LUFS` : undefined, pauses: b.sound!.pauses }));
  if (want('visual')) parts.push(element('visual', { references: refs(b.visual!.references) }, b.visual!.text));
  if (want('graphics')) parts.push(element('graphics', { references: refs(b.graphics!.references) }, b.graphics!.text));
  if (want('structure')) parts.push(element('structure', {}, b.structure!.text));
  if (want('cover')) parts.push(coverElement(b.cover!));
  return `<brand name="${escapeAttr(playbook.name)}">\n${parts.join('\n')}\n</brand>`;
}

/** <cover> holds its parts as child elements: <frame> (which still of the new video) and <design> (how the
 *  still becomes the cover, headline included). */
function coverElement(cover: BrandCover): string {
  const inner = (['frame', 'design'] as const).flatMap(part => cover[part]?.trim() ? [element(part, {}, cover[part])] : []).join('\n');
  return inner ? `<cover>\n${inner}\n</cover>` : '<cover/>';
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
  if (p.skillId !== undefined && (typeof p.skillId !== 'string' || !p.skillId || p.skillId.length > 100)) fail('skillId', 'Skill id');
  if (p.skills !== undefined && (!Array.isArray(p.skills) || p.skills.some(id => !(BRAND_EDITING_SKILL_IDS as readonly string[]).includes(id)))) fail('skills', BRAND_EDITING_SKILL_IDS.join(' / '));
  if (!isObject(p.source) || !Array.isArray(p.source.videos) || p.source.videos.length > 30) fail('source', '最多 30 条作品');
  if (p.source.preview) { asset(p.source.preview, 'source.preview'); if (p.source.preview.kind !== 'image' || typeof p.source.preview.cleaned !== 'boolean') fail('source.preview', '需要图片与 cleaned'); }
  if (!isObject(p.blocks)) fail('blocks', '缺失');
  const b = p.blocks;
  for (const key of Object.keys(b)) if (!BLOCK_IDS.includes(key as BlockId)) fail(`blocks.${key}`, '未知的块');
  for (const id of ['portrait', 'visual', 'structure'] as const) if (b[id]) prose(b[id], `blocks.${id}`);
  if (b.visual) references(b.visual.references, 'blocks.visual.references');
  if (b.graphics) { prose(b.graphics, 'blocks.graphics'); references(b.graphics.references, 'blocks.graphics.references'); }
  if (b.cover) {
    if (!isObject(b.cover)) fail('blocks.cover', '需要对象');
    for (const key of ['frame', 'design'] as const) if (b.cover[key] !== undefined && (typeof b.cover[key] !== 'string' || b.cover[key]!.length > MAX_TEXT)) fail(`blocks.cover.${key}`, `最多 ${MAX_TEXT} 字`);
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
  if (b.overlay_text) {
    prose(b.overlay_text, 'blocks.overlay_text');
    for (const key of ['font', 'fontLike'] as const) if (b.overlay_text[key] !== undefined && (typeof b.overlay_text[key] !== 'string' || b.overlay_text[key]!.length > 80)) fail(`blocks.overlay_text.${key}`, '字体');
    references(b.overlay_text.references, 'blocks.overlay_text.references');
  }
  if (b.sound) {
    if (b.sound.lufs !== undefined && !(b.sound.lufs >= -40 && b.sound.lufs <= -5)) fail('blocks.sound.lufs', '-40…-5');
    if (b.sound.pauses !== undefined && !['tight', 'moderate', 'natural'].includes(b.sound.pauses)) fail('blocks.sound.pauses', 'tight/moderate/natural');
  }

  return p;
}

/** A scene's copy: the same shape without the source list. */
export function validatePlaybookSnapshot(value: unknown): PlaybookSnapshot {
  validatePlaybook({ ...(value as object), source: { platform: 'upload', videos: [] } });
  return value as PlaybookSnapshot;
}
