/** Persisted metadata compatibility only. Brand analysis, prompts and execution live in the hosted product. */
import type { CaptionStyle } from './composition-core';
const PLAYBOOK_SCHEMA = 3;
const BRAND_PREFERENCE_IDS = ['cover','pauses','cleanup','denoise','broll','graphics','sound','zoom','headlines','logo','intro','outro','music','loudness'] as const;
const BRAND_PROMPT_FEATURES = ['cover','headlines','broll','graphics','sound','zoom'] as const;
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
