/**
 * A custom Skill is one SKILL.md: what the finished video should be like.
 *
 *   ---
 *   name: …            what it is called
 *   description: …     what it makes and when to use it
 *   summary: …         one line for the picker (optional)
 *   inputs: ["…"]      what the user brings each time (optional; the starter message lists them)
 *   settings: {…}      style reused as is, applied by program (optional): editing switches, pause
 *                      pacing, the caption look, the narration voice
 *   ---
 *   The targets: what the video is for, its structure, how footage, graphics, pacing and emphasis
 *   should land — measured from a finished edit, never its operations.
 *
 *   ```look
 *   {…}                the motion-graphics template, installed by program when a task starts
 *   ```
 *
 * A brand is identity and wins where it speaks (its captions, its pacing); a Skill fills the rest.
 */

import type { CaptionStyle } from './composition-core';
import type { DocumentLook } from './look';
import type { EditorDocumentV2 } from './editor-document/types';
import { EDITING_SKILL_IDS } from './editing-skills';

export type SkillPauses = 'tight' | 'moderate' | 'natural';

export interface SkillCaptionSetting {
  style?: Partial<CaptionStyle>;
  accent?: 'keywords' | 'numbers' | 'current_word' | null;
}

/** Style a Skill reuses exactly. */
export interface SkillSettings {
  switches?: string[];
  pauses?: SkillPauses;
  captions?: SkillCaptionSetting;
  /** Narration voice by name, resolved against the account's voices when narration is generated. */
  voice?: string;
}

export interface SkillMarkdown {
  name: string;
  description: string;
  summary?: string;
  inputs: string[];
  settings: SkillSettings;
  /** The targets, without the look block. */
  body: string;
  look?: DocumentLook;
}

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const CAPTION_STYLE_KEYS = ['preset', 'animation', 'yPct', 'xPct', 'wPct', 'scale', 'hPct', 'color', 'accentColor', 'strokeColor', 'strokeWidth', 'emphasis', 'bold', 'font', 'bg'] as const;

/** The caption look a Skill keeps: the visual fields of a caption style, without its on switch or translation. */
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

/** Keep only what the platform can apply; anything else in hand-written settings is dropped. */
export function normalizeSkillSettings(value: unknown): SkillSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: SkillSettings = {};
  if (Array.isArray(raw.switches)) {
    const switches = EDITING_SKILL_IDS.filter((id) => (raw.switches as unknown[]).includes(id));
    if (switches.length) out.switches = switches;
  }
  if (raw.pauses === 'tight' || raw.pauses === 'moderate' || raw.pauses === 'natural') out.pauses = raw.pauses;
  const captions = raw.captions && typeof raw.captions === 'object' && !Array.isArray(raw.captions) ? raw.captions as Record<string, unknown> : undefined;
  if (captions) {
    const style = skillCaptionStyle(captions.style as Partial<CaptionStyle> | undefined);
    const accent = captions.accent === 'keywords' || captions.accent === 'numbers' || captions.accent === 'current_word' ? captions.accent : undefined;
    if (style || accent) out.captions = { ...(style ? { style } : {}), ...(accent ? { accent } : {}) };
  }
  const voice = text(raw.voice, 60);
  if (voice) out.voice = voice;
  return out;
}

function normalizeInputs(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => { const label = text(item, 40); return label ? [label] : []; }).slice(0, 12) : [];
}

function scalar(raw: string): unknown {
  const value = raw.trim();
  if (/^[[{]/.test(value)) {
    try { return JSON.parse(value); } catch { return undefined; }
  }
  if (/^".*"$/.test(value)) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  return value.replace(/^'(.*)'$/, '$1');
}

const LOOK_BLOCK = /\n?```look[ \t]*\n([\s\S]*?)\n```[ \t]*(?:\n|$)/;

/** Read a SKILL.md. Missing frontmatter keys come from `fallback` (Skills written before it). */
export function parseSkillMarkdown(markdown: string, fallback: { name?: string; description?: string; summary?: string | null } = {}): SkillMarkdown {
  const source = markdown.replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const fields: Record<string, unknown> = {};
  if (match) {
    for (const line of match[1]!.split('\n')) {
      const at = line.indexOf(':');
      if (at <= 0 || /^\s/.test(line)) continue;
      fields[line.slice(0, at).trim()] = scalar(line.slice(at + 1));
    }
  }
  let body = match ? source.slice(match[0].length) : source;
  let look: DocumentLook | undefined;
  const block = body.match(LOOK_BLOCK);
  if (block) {
    try {
      const parsed = JSON.parse(block[1]!) as DocumentLook;
      if (parsed && typeof parsed === 'object' && typeof parsed.css === 'string' && parsed.pieces && typeof parsed.pieces === 'object') look = parsed;
    } catch { /* an unreadable look is ignored, the targets still apply */ }
    body = body.replace(LOOK_BLOCK, '\n');
  }
  const summary = text(fields.summary, 300) ?? (fallback.summary ?? undefined);
  // A SKILL.md written to the common convention names itself with a slug and titles its body.
  const slug = text(fields.name, 80);
  const heading = body.match(/^#[ \t]+(.+)$/m)?.[1];
  const name = text(fields.title, 80) ?? (slug && /^[a-z0-9-]+$/.test(slug) && heading ? text(heading, 80) : slug);
  return {
    name: name ?? fallback.name ?? '',
    description: text(fields.description, 500) ?? fallback.description ?? '',
    ...(summary ? { summary } : {}),
    inputs: normalizeInputs(fields.inputs),
    settings: normalizeSkillSettings(fields.settings),
    body: body.trim(),
    ...(look ? { look } : {}),
  };
}

const yamlString = (value: string) => (/^[\w\u0080-￿][^:#\n]*$/.test(value) && !/^(true|false|null|\d)/i.test(value) ? value : JSON.stringify(value));

/** Write a SKILL.md: frontmatter, the targets, and the look block when there is one. */
export function composeSkillMarkdown(skill: SkillMarkdown): string {
  const lines = [
    '---',
    `name: ${yamlString(skill.name)}`,
    `description: ${yamlString(skill.description)}`,
    ...(skill.summary ? [`summary: ${yamlString(skill.summary)}`] : []),
    ...(skill.inputs.length ? [`inputs: ${JSON.stringify(skill.inputs)}`] : []),
    ...(Object.keys(skill.settings).length ? [`settings: ${JSON.stringify(skill.settings)}`] : []),
    '---',
    '',
    skill.body.trim(),
  ];
  if (skill.look) lines.push('', '```look', JSON.stringify(skill.look), '```');
  return `${lines.join('\n')}\n`;
}

/** The message filled into Chat when the Skill is picked: one line per input to complete. */
export function skillStarterPrompt(inputs: readonly string[]): string | null {
  return inputs.length ? inputs.map((label) => `${label}: `).join('\n') : null;
}

/* ------------------------------ from a finished edit ------------------------------ */

/**
 * The style a finished edit shows, reusable as is: the editing switches and pacing of its task,
 * and its caption look unless a brand supplied that look.
 */
export function detectSkillSettings(document: EditorDocumentV2, task: { switches?: readonly string[]; pauses?: SkillPauses; brandCaptions?: boolean } = {}): SkillSettings {
  const out: SkillSettings = {};
  const switches = task.switches ? EDITING_SKILL_IDS.filter((id) => task.switches!.includes(id)) : [];
  if (switches.length) out.switches = switches;
  if (task.pauses) out.pauses = task.pauses;
  const captionStyle = document.appearance.captionStyle;
  if (captionStyle?.on && !task.brandCaptions) {
    const style = skillCaptionStyle(captionStyle);
    if (style) out.captions = { style };
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
  /** Graphics on screen: how many per minute, how long each holds, where they sit. */
  graphics: { count: number; perMinute: number; meanSec: number; zones: Record<'top' | 'middle' | 'bottom', number> } | null;
  captions: { on: boolean; emphasizedWords: number };
  transitions: number;
  music: boolean;
  soundEffects: number;
}

const round = (value: number, step = 0.1) => Number((Math.round(value / step) * step).toFixed(step < 0.1 ? 2 : 1));

/** The finished edit as numbers: what a Skill's targets are measured from. */
export function measureSkillStyle(document: EditorDocumentV2): SkillStyleMeasure {
  const fps = document.canvas.fps;
  const end = Math.max(0, ...document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames)));
  const durationSec = end / fps;
  const minutes = Math.max(durationSec / 60, 1 / 60);
  const roleOf = (role: string) => document.timeline.tracks.filter((track) => track.role === role);
  const story = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const storyClips = story?.clips.filter((clip) => clip.enabled) ?? [];
  const brollClips = document.timeline.tracks
    .filter((track) => track.type === 'visual' && track.id !== story?.id && track.role !== 'pipLayer')
    .flatMap((track) => track.clips.filter((clip) => clip.enabled && clip.kind === 'media'));
  const brollSec = brollClips.map((clip) => clip.durationFrames / fps);
  const covered = new Set<number>();
  for (const clip of brollClips) for (let frame = clip.startFrame; frame < clip.startFrame + clip.durationFrames; frame += Math.max(1, Math.round(fps / 10))) covered.add(Math.round(frame / Math.max(1, Math.round(fps / 10))));
  const graphics = document.timeline.tracks.flatMap((track) => track.type === 'graphics' ? track.clips.filter((clip) => clip.enabled && clip.kind === 'graphic') : []);
  const zones = { top: 0, middle: 0, bottom: 0 };
  for (const clip of graphics) {
    const box = clip.kind === 'graphic' ? clip.block.box : undefined;
    const center = box ? box.y + box.h / 2 : 0.5;
    zones[center < 0.34 ? 'top' : center > 0.66 ? 'bottom' : 'middle'] += 1;
  }
  const emphasizedWords = Object.values(document.semantics.transcripts).flat()
    .reduce((sum, segment) => sum + Object.values((segment as { wordDecorations?: Record<string, { highlight?: unknown }> }).wordDecorations ?? {}).filter((decoration) => decoration?.highlight).length, 0);
  return {
    durationSec: round(durationSec),
    storyCutsPerMinute: round(Math.max(0, storyClips.length - 1) / minutes),
    meanShotSec: storyClips.length ? round(storyClips.reduce((sum, clip) => sum + clip.durationFrames, 0) / fps / storyClips.length) : 0,
    broll: brollSec.length
      ? { coverage: round(Math.min(1, (covered.size * Math.max(1, Math.round(fps / 10))) / Math.max(1, end)), 0.01), count: brollSec.length, meanSec: round(brollSec.reduce((a, b) => a + b, 0) / brollSec.length), minSec: round(Math.min(...brollSec)), maxSec: round(Math.max(...brollSec)) }
      : null,
    graphics: graphics.length
      ? { count: graphics.length, perMinute: round(graphics.length / minutes), meanSec: round(graphics.reduce((sum, clip) => sum + clip.durationFrames, 0) / fps / graphics.length), zones }
      : null,
    captions: { on: !!document.appearance.captionStyle?.on, emphasizedWords },
    transitions: document.timeline.transitions?.length ?? 0,
    music: roleOf('music').some((track) => track.clips.some((clip) => clip.enabled)),
    soundEffects: roleOf('sfx').reduce((sum, track) => sum + track.clips.filter((clip) => clip.enabled).length, 0),
  };
}

/** A stored look as the set_look call that installs it again. */
export function lookToolInput(look: DocumentLook): Record<string, unknown> {
  return {
    css: look.css,
    pieces: Object.entries(look.pieces).map(([id, piece]) => {
      const schema = piece.propsSchema as { properties?: unknown } | undefined;
      return { id, label: piece.label, source: piece.source, ...(schema ? { propsSchema: JSON.stringify(schema.properties ?? schema) } : {}) };
    }),
    ...(look.notes ? { notes: look.notes } : {}),
    ...(look.fonts ? { fonts: look.fonts } : {}),
  };
}
