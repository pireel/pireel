import './editor-product-commands';
import { brandFeaturePrompt, upgradeBrandFeatureSettings, BRAND_PROMPT_FEATURES, validateBrandFeatureSettings, type BrandFeatureSettings } from '@pireel/studio-engine/brand-feature-settings';
import { hashSection } from '@pireel/studio-engine/stable-json';
import { BRAND_PREFERENCE_IDS, brandPreferences, upgradeBrandPreferences, type BrandPreferences } from '@pireel/studio-engine/brand-preferences';
import { naturalTechniqueText } from '@pireel/studio-engine/brand-prose';
import type { CaptionStyle } from '@pireel/studio-engine/composition-core';
import { BASE_CAPTION_FONT_PX } from '@pireel/studio-engine/caption-presets';
import { BRAND_EDITING_SKILL_IDS } from '@pireel/studio-engine/editing-skills';

/** Fixed brand configuration and editing switches.
 * Legacy prose fields are accepted for storage compatibility, but ignored by new editing consumers.
 */
export const PLAYBOOK_SCHEMA = 3;

export type BrandPlatform = 'douyin' | 'tiktok' | 'youtube' | 'bilibili' | 'xiaohongshu' | 'upload';
export type Confidence = 'high' | 'medium' | 'low';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** A durable media file the brand owns (content-addressed cloud key, never a temporary URL). */
export interface BrandAudio { key: string; kind: 'audio'; durationSec: number; name?: string; id?: string }
export const MAX_BRAND_MUSIC = 20;
export interface BrandReusableMedia { intro?: BrandAsset; outro?: BrandAsset; music?: BrandAudio[] }

export interface BrandAsset { key: string; kind: 'image' | 'video'; width: number; height: number; durationSec?: number }

/** Where a block came from: the videos it holds in, frames that show it, how sure it is. */
export interface Evidence { videos: string[]; frames?: { video: string; sec: number; key?: string }[]; confidence: Confidence }

/** A block's prose, in the creator's language, as the models read it. */
export interface Prose { text?: string; evidence?: Evidence }

/** Read a legacy single track as a list, preserving its existing project asset identity. */
export function brandMusicTracks(brand: { media?: { music?: unknown } }): BrandAudio[] {
  const music = brand.media?.music;
  if (music === undefined) return [];
  return Array.isArray(music) ? music : [{ ...(music as BrandAudio), id: (music as BrandAudio)?.id ?? 'brand-music' }];
}

/** Shared by the prompt and library; removing or reordering tracks never retargets ids. */
export function brandMediaEntries(brand: Pick<BrandPlaybook, 'media'> & Partial<Pick<BrandPlaybook, 'blocks' | 'preferences' | 'skills'>>): { role: 'intro' | 'outro' | 'music'; id: string; asset: BrandAsset | BrandAudio }[] {
  const enabled = brandPreferences({ ...brand, blocks: brand.blocks ?? {} });
  return [
    ...(['intro', 'outro'] as const).flatMap(role => enabled[role] && brand.media?.[role] ? [{ role, id: `brand-${role}`, asset: brand.media[role]! }] : []),
    ...(enabled.music ? brandMusicTracks(brand) : []).map(asset => ({ role: 'music' as const, id: asset.id ?? `brand-music-${hashSection(asset.key)}`, asset })),
  ];
}

/** The cover prompt: `frame` describes a base picture or subject reference from the new video;
 *  `design` first chooses image generation or still plus text, then describes the composition and headline. */
export interface BrandCover {
  frame?: string; design?: string;
  /** Cover examples, kept apart from references for video editing. */
  referenceKeys?: string[];
  evidence?: Evidence;
}

/** One part of the creator's editing style, in natural prose with reference stills. */
export type Technique = Prose & { references?: BrandAsset[] };

/** The blocks, in the order the prompt renders them. */
export interface BrandBlocks {
  /** The style in a few sentences. */
  portrait?: Prose;
  /** Fixed: burned-in captions (look applied by the engine; prose for what the values cannot say). */
  captions?: Prose & { on: boolean; style?: Partial<CaptionStyle>; accent?: 'keywords' | 'numbers' | 'current_word' | null };
  /** On-screen text besides captions — titles, labels, emphasis words, cards. Fixed: its font (`fontLike`
   *  names the original face). Prose: the technique, with reference stills. */
  overlay_text?: Technique & { font?: string; fontLike?: string };
  /** Fixed: a mark held in one corner. */
  logo?: BrandAsset & { corner: Corner; widthPct: number; opacity: number; evidence?: Evidence };
  /** Fixed: loudness and pause trimming. Prose: music and sound effects. */
  sound?: Prose & { lufs?: number; pauses?: 'tight' | 'moderate' | 'natural' };
  /** Where the speaker sits and how other pictures share the frame: full screen, picture in picture, split screens, cards beside the speaker. */
  layout?: Technique;
  /** How shots meet: hard cuts, dissolves, flashes, wipes, and where they are used. */
  transitions?: Technique;
  /** Movement on the picture: jump cuts between framings, punch-ins, push-ins, pans, 3D camera moves. */
  camera?: Technique;
  /** Graphics: motion graphics, generated pictures, screenshots — which the creator uses and how they look (colours and type chosen per video, never fixed values). */
  graphics?: Technique;
  /** Illustrations, characters, memes and reaction pictures. */
  illustrations?: Technique;
  /** Where the pictures come from: own footage, news footage, screenshots and documents, stock, generated. */
  footage?: Technique;
  /** How fast the video moves: shot lengths, how speech and pictures keep pace. */
  pacing?: Prose;
  /** How a video opens, unfolds and closes. */
  structure?: Prose;
  /** Reusable pieces of the creator's videos (end cards, recurring characters, templates), described with stills. */
  assets?: Technique;
  /** The cover's production approach and design prompt, with a frame-selection rule for its base or reference. */
  cover?: BrandCover;
}
export type BlockId = keyof BrandBlocks;
export const BLOCK_IDS: readonly BlockId[] = ['portrait', 'captions', 'overlay_text', 'logo', 'sound', 'layout', 'transitions', 'camera', 'graphics', 'illustrations', 'footage', 'pacing', 'structure', 'assets', 'cover'];
/** The technique blocks (prose with reference stills). */
export const TECHNIQUE_BLOCKS = ['layout', 'transitions', 'camera', 'graphics', 'illustrations', 'footage', 'assets'] as const;
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
  /** Legacy prose, accepted for reading old records only; never passed to editing. */
  style?: { text: string; references?: BrandAsset[] };
  preferences?: BrandPreferences;
  /** Settings scoped to the matching capability switch; retained while disabled. */
  settings?: BrandFeatureSettings;
  media?: BrandReusableMedia;
  /** Editing skills a project edited with this brand starts with (ids from editing-skills), until the
   *  creator sets the project's own; the analysis sets them, the creator edits them. */
  skills?: string[];
  /** The Studio Skill (kind of video) this brand is a style of; read through brandSkillOf. */
  skillId?: string;
  /** What the brand rests on and what it cannot say, for the creator (never part of the prompt). */
  notes?: { evidence?: string; gaps?: string[] };
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
  const { source: _source, ...snapshot } = fixedBrandConfiguration(structuredClone(playbook));
  const covers = brandCoverReferenceKeys(playbook);
  if (snapshot.blocks.cover?.referenceKeys === undefined && covers.length) snapshot.blocks.cover = { ...snapshot.blocks.cover, referenceKeys: covers };
  return snapshot;
}

export function emptyPlaybook(id: string, name: string, platform: BrandPlatform = 'upload'): BrandPlaybook {
  return { schema: PLAYBOOK_SCHEMA, id, name, version: 1, method: 'manual', source: { platform, videos: [] }, blocks: {} };
}

/** Legacy descriptions remain readable in stored backups, but no longer guide new edits. */
export function brandStyleText(_brand: Pick<BrandPlaybook, 'blocks' | 'style'>): string { return ''; }

/** Keep only reusable configuration. Called when a brand is edited, saved or snapshotted. */
export function fixedBrandConfiguration<T extends Pick<BrandPlaybook, 'blocks'> & Partial<BrandPlaybook>>(brand: T): T {
  const b = brand.blocks;
  const blocks: BrandBlocks = {
    ...(b.captions ? { captions: { on: b.captions.on, style: b.captions.style, accent: b.captions.accent } } : {}),
    ...(b.overlay_text ? { overlay_text: { font: b.overlay_text.font, fontLike: b.overlay_text.fontLike } } : {}),
    ...(b.logo ? { logo: b.logo } : {}),
    ...(b.sound ? { sound: { lufs: b.sound.lufs, pauses: b.sound.pauses } } : {}),
    ...(b.cover || brand.source?.videos.some(v => v.coverKey) ? { cover: { referenceKeys: brandCoverReferenceKeys(brand) } } : {}),
  };
  const { style: _style, presets: _withdrawnPresets, ...rest } = brand as T & { presets?: unknown };
  return { ...rest, blocks, ...(brand.preferences !== undefined ? { preferences: upgradeBrandPreferences(brand.preferences) } : {}), ...(brand.settings !== undefined ? { settings: upgradeBrandFeatureSettings(brand.settings) } : {}) } as T;
}

/** An explicit empty list means the creator removed the examples; do not restore them from sources. */
export function brandCoverReferenceKeys(brand: Pick<BrandPlaybook, 'blocks'> & Partial<Pick<BrandPlaybook, 'source'>>): string[] {
  if (brand.blocks.cover?.referenceKeys !== undefined) return brand.blocks.cover.referenceKeys;
  return [...new Set((brand.source?.videos ?? []).flatMap(video => video.coverKey ? [video.coverKey] : []))].slice(0, 8);
}

export function brandStyleReferences(_brand: Pick<BrandPlaybook, 'blocks' | 'style'> & Partial<Pick<BrandPlaybook, 'source'>>): BrandAsset[] {
  return [];
}

export function brandGraphicsStyle(brand: Pick<BrandPlaybook, 'blocks' | 'style' | 'settings' | 'preferences' | 'skills' | 'media'>): string | null { return brandFeaturePrompt(brand, 'graphics'); }

/** Cover generation consumes only its own enabled configuration. */
export function activeBrandCover(brand: Pick<BrandPlaybook, 'blocks' | 'settings' | 'preferences' | 'skills' | 'media'>): BrandCover | undefined {
  if (!brandPreferences(brand).cover) return undefined;
  return { referenceKeys: brand.blocks.cover?.referenceKeys, ...(brandFeaturePrompt(brand, 'cover') ? { design: brandFeaturePrompt(brand, 'cover')! } : {}) };
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
export function renderBrandPrompt(playbook: Pick<BrandPlaybook, 'name' | 'blocks' | 'style' | 'preferences' | 'media' | 'skills' | 'settings'>, only?: readonly BlockId[]): string {
  const b = fixedBrandConfiguration(playbook).blocks;
  const enabled = brandPreferences(playbook);
  const want = (id: BlockId) => (!only || only.includes(id)) && b[id] !== undefined;
  const parts: string[] = [];
  const editing = !only || only.some(id => id !== 'cover');
  if (editing) {
    parts.push(element('editing_preferences', enabled, 'Use enabled capabilities where the new content benefits. Disabled capabilities must not be added. Choose B-roll and motion graphics from the new content when enabled; these capabilities do not require a template selection.'));
  }
  if (editing && playbook.media) {
    const media = brandMediaEntries(playbook).map(({ role, id, asset }) => element(role, { id, cloudKey: asset.key, kind: asset.kind, durationSec: asset.durationSec, ...('width' in asset ? { width: asset.width, height: asset.height } : { name: asset.name }) }));
    if (media.length) parts.push(`<brand_media>\nThese are supplied reusable assets. Register their exact ids and cloudKeys with register_media if they are not in the project, then place them when the requested edit calls for them. The music entries are alternatives: choose a suitable track for the new video’s content, pace and mood, rather than layering every track or inserting them all. Use the provided names and durations to guide selection; do not claim to have listened when you have not. Preserve narration intelligibility under music.\n${media.join('\n')}\n</brand_media>`);
  }
  if (want('captions')) {
    const c = b.captions!; const s = c.style ?? {};
    // Size as the engine draws it: font px on a frame 1080 wide.
    parts.push(element('captions', c.on ? { on: true, preset: s.preset, font: s.font, size: s.scale !== undefined ? `${Math.round(s.scale * BASE_CAPTION_FONT_PX)}px on a 1080-wide frame` : undefined, color: s.color, stroke: s.strokeColor, plate: s.bg, bold: s.bold, animation: s.animation, accent: c.accent ?? undefined, 'accent-color': s.emphasis ?? s.accentColor, 'bottom-edge': s.yPct !== undefined ? `${s.yPct}% from top` : undefined } : { on: false }));
  }
  if (want('captions') && b.captions?.on && b.captions.accent === 'keywords') parts.push(element('caption-emphasis', {}, 'Selective word coloring is enabled. Highlight reading anchors such as names, products, numbers, actions and expressive phrases; they need not be major conclusions. This is independent of karaoke tracking and large headline graphics. A style described as avoiding word-by-word animation or using large emphasis rarely does not disable this selection. Preserve the brand typography and highlight color.'));
  if (want('overlay_text') && enabled.headlines) parts.push(element('overlay_text', { font: b.overlay_text!.font, like: b.overlay_text!.fontLike }));
  if (want('logo') && enabled.logo) parts.push(element('logo', { corner: b.logo!.corner, width: `${b.logo!.widthPct}%`, opacity: b.logo!.opacity }));
  if (want('sound')) parts.push(element('sound', { loudness: enabled.loudness && b.sound!.lufs !== undefined ? `${b.sound!.lufs} LUFS` : undefined, pauses: enabled.pauses ? b.sound!.pauses : undefined }));
  const scope: Record<typeof BRAND_PROMPT_FEATURES[number], BlockId> = { cover: 'cover', headlines: 'overlay_text', broll: 'footage', graphics: 'graphics', sound: 'sound', zoom: 'camera' };
  for (const id of BRAND_PROMPT_FEATURES) {
    if (id === 'cover' || only && !only.includes(scope[id])) continue;
    const prompt = brandFeaturePrompt(playbook, id);
    if (prompt) parts.push(element('feature_settings', { feature: id }, prompt));
  }
  if ((!only || only.includes('cover')) && enabled.cover) parts.push(coverElement(activeBrandCover(playbook)!));
  return `<brand name="${escapeAttr(playbook.name)}">\n${parts.join('\n')}\n</brand>`;
}

/** <cover> holds <frame> (base picture or subject reference) and <design> (production approach and prompt). */
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

/**
 * Blocks of a brand made before the toolkit split (schema 2): its `visual` prose — the picture's
 * organisation and moves — becomes the layout technique. Anything else carries over as it is.
 */
export function upgradeBlocks(blocks: BrandBlocks): BrandBlocks {
  if (!isObject(blocks)) return blocks;
  const legacy = blocks as BrandBlocks & { visual?: Technique };
  let next = blocks;
  if (legacy.visual) {
    const { visual, ...rest } = legacy;
    next = { ...rest, ...(rest.layout ? {} : { layout: visual }) };
  }
  for (const id of ['overlay_text', 'layout', 'transitions', 'camera', 'graphics', 'illustrations', 'footage', 'sound', 'pacing', 'structure'] as const) {
    const block = next[id];
    if (typeof block?.text !== 'string') continue;
    const text = naturalTechniqueText(block.text);
    if (text !== block.text) next = { ...next, [id]: { ...block, text } };
  }
  return next;
}

/** Read older schemas and generated description formats as the current brand, without mutating storage. */
export function upgradePlaybook<T extends { schema?: number; blocks?: BrandBlocks }>(value: T): T {
  if (!isObject(value) || (value.schema !== 2 && value.schema !== PLAYBOOK_SCHEMA)) return value;
  const blocks = upgradeBlocks(value.blocks ?? {});
  const media = (value as T & { media?: { music?: unknown } }).media;
  const storedPreferences = (value as T & { preferences?: unknown }).preferences;
  const preferences = upgradeBrandPreferences(storedPreferences);
  const storedSettings = (value as T & { settings?: unknown }).settings;
  const settings = upgradeBrandFeatureSettings(storedSettings);
  const legacyMusic = isObject(media) && isObject(media?.music);
  if (value.schema === PLAYBOOK_SCHEMA && blocks === value.blocks && !legacyMusic && settings === storedSettings && preferences === storedPreferences) return value;
  return { ...value, schema: PLAYBOOK_SCHEMA, blocks, ...(preferences !== storedPreferences ? { preferences } : {}), ...(settings !== storedSettings ? { settings } : {}), ...(legacyMusic ? { media: { ...media, music: brandMusicTracks({ media }) } } : {}) };
}

export function validatePlaybook(value: unknown): BrandPlaybook {
  const p = upgradePlaybook(value as BrandPlaybook);
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
  for (const id of ['portrait', 'pacing', 'structure'] as const) if (b[id]) prose(b[id], `blocks.${id}`);
  for (const id of TECHNIQUE_BLOCKS) if (b[id]) { prose(b[id], `blocks.${id}`); references(b[id]!.references, `blocks.${id}.references`); }
  if (b.cover) {
    if (!isObject(b.cover)) fail('blocks.cover', '需要对象');
    if (b.cover.referenceKeys !== undefined && (!Array.isArray(b.cover.referenceKeys) || b.cover.referenceKeys.length > 8 || b.cover.referenceKeys.some(key => typeof key !== 'string' || !key || /^(blob|data):/.test(key)))) fail('blocks.cover.referenceKeys', '最多 8 张持久化的封面参考图');
    for (const key of ['frame', 'design'] as const) if (b.cover[key] !== undefined && (typeof b.cover[key] !== 'string' || b.cover[key]!.length > MAX_TEXT)) fail(`blocks.cover.${key}`, `最多 ${MAX_TEXT} 字`);
  }
  if (b.captions) {
    prose(b.captions, 'blocks.captions');
    if (typeof b.captions.on !== 'boolean') fail('blocks.captions.on', '布尔');
    for (const key of ['color', 'accentColor', 'strokeColor', 'emphasis'] as const) color(b.captions.style?.[key], `blocks.captions.style.${key}`);
    const bg = b.captions.style?.bg;
    if (bg !== undefined && bg !== null && (typeof bg !== 'string' || !/^(#[0-9a-f]{6}|rgba?\([\d.,\s]+\))$/i.test(bg))) fail('blocks.captions.style.bg', '#RRGGBB 或 rgba()');
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
    prose(b.sound, 'blocks.sound');
    if (b.sound.lufs !== undefined && !(b.sound.lufs >= -40 && b.sound.lufs <= -5)) fail('blocks.sound.lufs', '-40…-5');
    if (b.sound.pauses !== undefined && !['tight', 'moderate', 'natural'].includes(b.sound.pauses)) fail('blocks.sound.pauses', 'tight/moderate/natural');
  }

  if (p.style !== undefined) {
    if (!isObject(p.style) || typeof p.style.text !== 'string' || p.style.text.length > 48000) fail('style.text', '最多 48000 字');
    if (p.style.references !== undefined) {
      if (!Array.isArray(p.style.references) || p.style.references.length > 64) fail('style.references', '最多 64 张参考图');
      p.style.references.forEach((item, index) => asset(item, `style.references.${index}`));
    }
  }
  if (p.settings !== undefined) validateBrandFeatureSettings(p.settings);
  if (p.preferences !== undefined) {
    if (!isObject(p.preferences)) fail('preferences', '需要对象');
    for (const [key, value] of Object.entries(p.preferences)) if ((key !== 'layout' && !(BRAND_PREFERENCE_IDS as readonly string[]).includes(key)) || typeof value !== 'boolean') fail(`preferences.${key}`, '需要有效的剪辑偏好');
  }
  if (p.media !== undefined) {
    if (!isObject(p.media) || Object.keys(p.media).some(key => !['intro', 'outro', 'music'].includes(key))) fail('media', '需要片头、片尾或音乐');
    for (const role of ['intro', 'outro'] as const) if (p.media[role]) {
      asset(p.media[role], `media.${role}`);
      if (p.media[role]!.kind !== 'video') fail(`media.${role}`, '需要视频');
    }
    const music = p.media.music;
    if (music !== undefined) {
      if (!Array.isArray(music) || music.length > MAX_BRAND_MUSIC) fail('media.music', `最多 ${MAX_BRAND_MUSIC} 首音乐`);
      const keys = new Set<string>(); const ids = new Set<string>();
      for (const [index, track] of music.entries()) {
        const path = `media.music.${index}`;
        if (!isObject(track) || track.kind !== 'audio' || typeof track.key !== 'string' || !track.key || /^(blob|data):/.test(track.key) || !Number.isFinite(track.durationSec) || track.durationSec <= 0) fail(path, '需要持久化的音频与时长');
        if (track.name !== undefined && (typeof track.name !== 'string' || track.name.length > 240)) fail(`${path}.name`, '最多 240 字');
        if (track.id !== undefined && (typeof track.id !== 'string' || !/^brand-music(?:-[a-z0-9.]+)?$/.test(track.id))) fail(`${path}.id`, '需要有效的音乐标识');
        const id = track.id ?? `brand-music-${hashSection(track.key)}`;
        if (keys.has(track.key) || ids.has(id)) fail(path, '音乐不能重复');
        keys.add(track.key); ids.add(id);
      }
    }
  }

  if (p.notes !== undefined) {
    if (!isObject(p.notes)) fail('notes', '需要对象');
    if (p.notes.evidence !== undefined && (typeof p.notes.evidence !== 'string' || p.notes.evidence.length > MAX_TEXT)) fail('notes.evidence', `最多 ${MAX_TEXT} 字`);
    if (p.notes.gaps !== undefined && (!Array.isArray(p.notes.gaps) || p.notes.gaps.length > 20 || p.notes.gaps.some(gap => typeof gap !== 'string' || gap.length > 600))) fail('notes.gaps', '最多 20 条');
  }
  return p;
}

/** A scene's copy: the same shape without the source list. */
export function validatePlaybookSnapshot(value: unknown): PlaybookSnapshot {
  const { source: _source, ...snapshot } = validatePlaybook({ ...(value as object), source: { platform: 'upload', videos: [] } });
  return snapshot;
}
