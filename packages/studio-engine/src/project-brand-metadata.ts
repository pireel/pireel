/**
 * A brand as a project stores it, and what the editor reads from that copy: which Skill it belongs to,
 * which capabilities it turns on, the graphics and cover settings of enabled capabilities. Brand
 * analysis, validation, prompts and execution live in the hosted product.
 */
import type { CaptionStyle } from './composition-core';
import { BRAND_EDITING_SKILL_IDS } from './editing-skills';
export const PLAYBOOK_SCHEMA = 3;
export const BRAND_PREFERENCE_IDS = ['cover','pauses','cleanup','denoise','broll','graphics','sound','zoom','headlines','logo','intro','outro','music','loudness'] as const;
export const BRAND_PROMPT_FEATURES = ['cover','headlines','broll','graphics','sound','zoom'] as const;
export type BrandPreferenceId = typeof BRAND_PREFERENCE_IDS[number];
export type BrandPreferences = Partial<Record<BrandPreferenceId, boolean>> & { layout?: boolean; /** Legacy only; ignored by all brand consumers. */ transitions?: boolean };
export type BrandPromptFeature = typeof BRAND_PROMPT_FEATURES[number];
export interface BrandFeatureTheme { background?: string; foreground?: string; accent?: string; font?: string }
export interface BrandFeatureSetting { prompt?: string; theme?: BrandFeatureTheme }
export type BrandFeatureSettings = Partial<Record<BrandPromptFeature, BrandFeatureSetting>>;
export type BrandPlatform = 'douyin' | 'tiktok' | 'youtube' | 'bilibili' | 'xiaohongshu' | 'upload';
export type Confidence = 'high' | 'medium' | 'low';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface BrandAudio { key: string; kind: 'audio'; durationSec: number; name?: string; id?: string }
export interface BrandReusableMedia { intro?: BrandAsset; outro?: BrandAsset; music?: BrandAudio[] }
export interface BrandAsset { key: string; kind: 'image' | 'video'; width: number; height: number; durationSec?: number }
export interface Evidence { videos: string[]; frames?: { video: string; sec: number; key?: string }[]; confidence: Confidence }
export interface Prose { text?: string; evidence?: Evidence }
export interface BrandCover {
  frame?: string; design?: string;
  /** Cover examples, kept apart from references for video editing. */
  referenceKeys?: string[];
  evidence?: Evidence;
}
export type Technique = Prose & { references?: BrandAsset[] };
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
export type PlaybookSnapshot = Omit<BrandPlaybook, 'source'>;

/** The Studio Skills a brand can belong to: only talking-head videos for now. A project on any other
 *  Skill (or the creator's own) is edited without a brand. */
export const BRAND_SKILL_IDS: readonly string[] = ['talking-head-edit'];
export const DEFAULT_BRAND_SKILL_ID = 'talking-head-edit';
/** The Skill a brand belongs to (brands made before skills were recorded are talking-head brands). */
export const brandSkillOf = (brand: Pick<BrandPlaybook, 'skillId'>) => brand.skillId ?? DEFAULT_BRAND_SKILL_ID;
export const skillTakesBrand = (skillId: string | undefined) => !!skillId && BRAND_SKILL_IDS.includes(skillId);

type BrandSettings = Pick<BrandPlaybook, 'blocks' | 'skills' | 'preferences' | 'media'>;

/** Editing switches are independent of style descriptions and template choices. */
export function brandPreferences(brand: BrandSettings): Record<BrandPreferenceId, boolean> {
  const skills = new Set(brand.skills ?? []);
  const b = brand.blocks;
  const { layout: _reservedLayout, transitions: _retiredTransitions, ...preferences } = brand.preferences ?? {};
  return {
    cover: !!b.cover?.referenceKeys?.length,
    pauses: skills.has('rough-cut') && b.sound?.pauses !== 'natural',
    cleanup: skills.has('rough-cut'), denoise: skills.has('voice-cleanup'),
    broll: skills.has('b-roll'), graphics: skills.has('graphics'),
    sound: skills.has('sound'), zoom: false, headlines: !!b.overlay_text?.font,
    logo: !!b.logo, loudness: b.sound?.lufs !== undefined,
    intro: !!brand.media?.intro, outro: !!brand.media?.outro, music: Array.isArray(brand.media?.music) ? brand.media.music.length > 0 : !!brand.media?.music,
    ...preferences,
  };
}

/** Existing execution skills are derived from the brand's controls, then frozen on the new project. */
export function brandEditingSkills(brand: BrandSettings): string[] {
  const p = brandPreferences(brand);
  return [
    ...(p.cover ? ['cover'] : []),
    ...(p.graphics ? ['graphics'] : []),
    ...(brand.blocks.captions?.on ? ['captions'] : []),
    ...(p.pauses || p.cleanup ? ['rough-cut'] : []),
    ...(p.denoise ? ['voice-cleanup'] : []),
    ...(p.broll ? ['b-roll'] : []), ...(p.sound ? ['sound'] : []),
  ];
}

type ConfiguredBrand = Pick<BrandPlaybook, 'blocks' | 'preferences' | 'skills' | 'media' | 'settings'>;

/** Turning off a capability retains its saved settings but removes them from execution. */
export function activeBrandSetting(brand: ConfiguredBrand, id: BrandPromptFeature): BrandFeatureSetting | undefined {
  return brandPreferences(brand)[id] ? brand.settings?.[id] : undefined;
}
export function brandFeaturePrompt(brand: ConfiguredBrand, id: BrandPromptFeature): string | null {
  const setting = activeBrandSetting(brand, id);
  if (!setting) return null;
  const theme = setting.theme;
  const tokens = theme ? Object.entries(theme).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join('; ') : '';
  return [tokens ? `Use this feature's configured theme: ${tokens}.` : '', setting.prompt?.trim()].filter(Boolean).join('\n') || null;
}
export function brandGraphicsStyle(brand: ConfiguredBrand & Partial<Pick<BrandPlaybook, 'style'>>): string | null { return brandFeaturePrompt(brand, 'graphics'); }

/** An explicit empty list means the creator removed the examples; do not restore them from sources. */
export function brandCoverReferenceKeys(brand: Pick<BrandPlaybook, 'blocks'> & Partial<Pick<BrandPlaybook, 'source'>>): string[] {
  if (brand.blocks.cover?.referenceKeys !== undefined) return brand.blocks.cover.referenceKeys;
  return [...new Set((brand.source?.videos ?? []).flatMap(video => video.coverKey ? [video.coverKey] : []))].slice(0, 8);
}

/** Cover generation consumes only its own enabled configuration. */
export function activeBrandCover(brand: ConfiguredBrand): BrandCover | undefined {
  if (!brandPreferences(brand).cover) return undefined;
  return { referenceKeys: brand.blocks.cover?.referenceKeys, ...(brandFeaturePrompt(brand, 'cover') ? { design: brandFeaturePrompt(brand, 'cover')! } : {}) };
}

/**
 * A brand copy as a project command receives it, checked for its shape only: the hosted product
 * validates a brand when it is saved, so a copy taken from a saved brand is already whole.
 */
export function readPlaybookSnapshot(value: unknown): PlaybookSnapshot {
  const item = value as Record<string, unknown> | null;
  const ok = !!item && typeof item === 'object' && !Array.isArray(item) && item.schema === PLAYBOOK_SCHEMA && typeof item.id === 'string' && !!item.id
    && typeof item.name === 'string' && !!item.name.trim() && Number.isInteger(item.version) && typeof item.method === 'string'
    && !!item.blocks && typeof item.blocks === 'object' && !Array.isArray(item.blocks);
  if (!ok) throw new Error('Invalid brand: needs schema, id, name, version, method and blocks');
  // The editing skills a brand may start a project with (editing-skills.ts).
  if (item.skills !== undefined && (!Array.isArray(item.skills) || item.skills.some(id => !(BRAND_EDITING_SKILL_IDS as readonly unknown[]).includes(id)))) throw new Error(`Invalid brand skills: ${BRAND_EDITING_SKILL_IDS.join(' / ')}`);
  for (const key of ['preferences', 'settings', 'media'] as const) if (item[key] !== undefined && (!item[key] || typeof item[key] !== 'object' || Array.isArray(item[key]))) throw new Error(`Invalid brand ${key}`);
  const { source: _source, ...snapshot } = item as unknown as BrandPlaybook;
  return snapshot;
}
