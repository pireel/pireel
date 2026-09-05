/**
 * Generation intent for the chat composer. Generation is an agent tool call (generate_image /
 * generate_video / generate_audio / element compose); the composer only lets the user say WHICH kind
 * and pin the few parameters a form used to hold (ratio, count, duration). The intent travels inside
 * the user's own message as one trailing line — never in the system prompt — so the agent reads it
 * like any other instruction and the prompt prefix stays byte-stable.
 */

import { localizedTemplatePrompt, TEMPLATES_BY_TYPE } from './gen-templates';
import { t } from './i18n';

export type GenerationIntent = 'image' | 'video' | 'music' | 'sfx' | 'element';
/** Composer mode: plain chat, or one generation intent that reshapes the composer. */
export type ChatMode = 'chat' | GenerationIntent;

export interface GenerationParams {
  /** image / video: hosted model id from the catalog (omit = default) */
  modelId?: string;
  /** image / video */
  ratio?: '9:16' | '16:9' | '1:1';
  /** image only, 1–4 */
  count?: number;
  /** image only: model quality tier */
  quality?: string;
  /** video only */
  resolution?: string;
  /** video 4–15 s · music 30–300 s · sfx 0.5–22 s */
  durationSec?: number;
}

export const GENERATION_INTENTS: readonly { id: GenerationIntent; label: string }[] = [
  { id: 'image', label: 'chatGen.intentImage' },
  { id: 'video', label: 'chatGen.intentVideo' },
  { id: 'music', label: 'chatGen.intentMusic' },
  { id: 'sfx', label: 'chatGen.intentSfx' },
  { id: 'element', label: 'chatGen.intentElement' },
];

export const RATIO_OPTIONS: readonly NonNullable<GenerationParams['ratio']>[] = ['9:16', '16:9', '1:1'];
export const IMAGE_COUNT_OPTIONS = [1, 2, 4] as const;
export const VIDEO_DURATION_OPTIONS = [5, 10, 15] as const;
export const MUSIC_DURATION_OPTIONS = [30, 60, 120, 180] as const;
export const SFX_DURATION_OPTIONS = [3, 5, 10, 15] as const;

/** The trailing instruction line appended to the user's message. English on purpose: it is read by
 * the model, not shown as UI; the user's own words above it stay in their language. */
export function generationIntentLine(intent: GenerationIntent, params: GenerationParams): string {
  const facts: string[] = [];
  if (params.modelId && (intent === 'image' || intent === 'video')) facts.push(`model ${params.modelId}`);
  if (params.ratio && (intent === 'image' || intent === 'video')) facts.push(`aspect ${params.ratio}`);
  if (params.count && intent === 'image') facts.push(`count ${params.count}`);
  if (params.quality && intent === 'image') facts.push(`quality ${params.quality}`);
  if (params.resolution && intent === 'video') facts.push(`resolution ${params.resolution}`);
  if (params.durationSec && (intent === 'video' || intent === 'music' || intent === 'sfx')) facts.push(`duration ${params.durationSec}s`);
  const kind: Record<GenerationIntent, string> = {
    image: 'an image',
    video: 'a video clip',
    music: 'a music track (kind music)',
    sfx: 'a sound effect (kind sfx)',
    element: 'an on-screen graphic element',
  };
  return `(Generate ${kind[intent]}${facts.length ? ` — ${facts.join(', ')}` : ''}; register the result in the project media and place it only if I asked.)`;
}

export interface GenerationTemplateCard {
  id: string;
  title: string;
  prompt: string;
  /** Bare storage keys for previews (image templates / finished video templates). */
  image?: string;
  video?: string;
}

/** Curated prompts for the armed intent (the old panel's template library): image/video/graphic
 * templates from the bundled catalog, built-in ideas for audio. */
export function generationTemplates(intent: GenerationIntent, locale: string, limit = 24): GenerationTemplateCard[] {
  if (intent === 'music' || intent === 'sfx') {
    const keys = intent === 'music'
      ? ['chatGen.audioIdea1', 'chatGen.audioIdea2', 'chatGen.audioIdea3']
      : ['chatGen.audioIdea4', 'chatGen.sfxIdea2', 'chatGen.sfxIdea3'];
    return keys.slice(0, limit).map((key) => {
      const prompt = t(key);
      return { id: key, title: prompt.slice(0, 24), prompt };
    });
  }
  const source = TEMPLATES_BY_TYPE[intent] ?? [];
  return source.slice(0, limit).map((template) => {
    const prompt = localizedTemplatePrompt(template, locale);
    return {
      id: template.id,
      title: template.title ? t(template.title) : prompt.slice(0, 24),
      prompt,
      ...(template.image ? { image: template.image } : {}),
      ...(template.video ? { video: template.video } : {}),
    };
  });
}

/** @deprecated use generationTemplates. */
export const generationTemplatePrompts = (intent: GenerationIntent, locale: string, limit = 6) =>
  generationTemplates(intent, locale, limit).map(({ id, title, prompt }) => ({ id, title, prompt }));
