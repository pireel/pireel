/**
 * What a finished edit shows about its style, for Create Skill. A custom Skill is free Markdown the
 * agent reads; these readings are material its author writes from (exact caption values, pacing,
 * proportions), so the next video can match the style. Nothing here is applied by program.
 */

import type { CaptionStyle } from './composition-core';
import type { EditorDocumentV2 } from './editor-document/types';
import { EDITING_SKILL_IDS } from './editing-skills';

export type SkillPauses = 'tight' | 'moderate' | 'natural';

/** Style values a finished edit used, worth writing into a Skill exactly. */
export interface SkillStyleSettings {
  switches?: string[];
  pauses?: SkillPauses;
  captions?: Partial<CaptionStyle>;
}

const CAPTION_STYLE_KEYS = ['preset', 'animation', 'yPct', 'xPct', 'wPct', 'scale', 'hPct', 'color', 'accentColor', 'strokeColor', 'strokeWidth', 'emphasis', 'bold', 'font', 'bg'] as const;

/** The visual fields of a caption style, without its on switch or translation. */
export function skillCaptionStyle(style: Partial<CaptionStyle> | undefined): Partial<CaptionStyle> | undefined {
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of CAPTION_STYLE_KEYS) {
    const value = (style as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (key === 'bg' ? value === null || typeof value === 'string' : ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return Object.keys(out).length ? out as Partial<CaptionStyle> : undefined;
}

/**
 * The style values a finished edit used: the editing switches and pacing of its task, and its
 * caption look unless a brand supplied that look.
 */
export function detectSkillSettings(document: EditorDocumentV2, task: { switches?: readonly string[]; pauses?: SkillPauses; brandCaptions?: boolean } = {}): SkillStyleSettings {
  const out: SkillStyleSettings = {};
  const switches = task.switches ? EDITING_SKILL_IDS.filter((id) => task.switches!.includes(id)) : [];
  if (switches.length) out.switches = switches;
  if (task.pauses) out.pauses = task.pauses;
  const captionStyle = document.appearance.captionStyle;
  if (captionStyle?.on && !task.brandCaptions) {
    const style = skillCaptionStyle(captionStyle);
    if (style) out.captions = style;
  }
  return out;
}

export interface SkillStyleMeasure {
  durationSec: number;
  /** Cuts in the spoken story per minute, and the mean length between them. */
  storyCutsPerMinute: number;
  meanShotSec: number;
  /** Footage laid over the story. */
  broll: { coverage: number; count: number; meanSec: number; minSec: number; maxSec: number } | null;
  captions: { on: boolean; emphasizedWords: number };
  transitions: number;
  music: boolean;
  soundEffects: number;
}

const round = (value: number, step = 0.1) => Number((Math.round(value / step) * step).toFixed(step < 0.1 ? 2 : 1));

/** The finished edit as numbers, for a Skill's proportions and ranges. */
export function measureSkillStyle(document: EditorDocumentV2): SkillStyleMeasure {
  const fps = document.canvas.fps;
  const end = Math.max(0, ...document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames)));
  const minutes = Math.max(end / fps / 60, 1 / 60);
  const story = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const storyClips = story?.clips.filter((clip) => clip.enabled) ?? [];
  const brollClips = document.timeline.tracks
    .filter((track) => track.type === 'visual' && track.id !== story?.id && track.role !== 'pipLayer')
    .flatMap((track) => track.clips.filter((clip) => clip.enabled && clip.kind === 'media'));
  const brollSec = brollClips.map((clip) => clip.durationFrames / fps);
  const step = Math.max(1, Math.round(fps / 10));
  const covered = new Set<number>();
  for (const clip of brollClips) for (let frame = clip.startFrame; frame < clip.startFrame + clip.durationFrames; frame += step) covered.add(Math.floor(frame / step));
  const roleClips = (role: string) => document.timeline.tracks.filter((track) => track.role === role).flatMap((track) => track.clips.filter((clip) => clip.enabled));
  const emphasizedWords = Object.values(document.semantics.transcripts).flat()
    .reduce((sum, segment) => sum + Object.values((segment as { wordDecorations?: Record<string, { highlight?: unknown }> }).wordDecorations ?? {}).filter((decoration) => decoration?.highlight).length, 0);
  return {
    durationSec: round(end / fps),
    storyCutsPerMinute: round(Math.max(0, storyClips.length - 1) / minutes),
    meanShotSec: storyClips.length ? round(storyClips.reduce((sum, clip) => sum + clip.durationFrames, 0) / fps / storyClips.length) : 0,
    broll: brollSec.length
      ? { coverage: round(Math.min(1, (covered.size * step) / Math.max(1, end)), 0.01), count: brollSec.length, meanSec: round(brollSec.reduce((a, b) => a + b, 0) / brollSec.length), minSec: round(Math.min(...brollSec)), maxSec: round(Math.max(...brollSec)) }
      : null,
    captions: { on: !!document.appearance.captionStyle?.on, emphasizedWords },
    transitions: document.timeline.transitions?.length ?? 0,
    music: roleClips('music').length > 0,
    soundEffects: roleClips('sfx').length,
  };
}
