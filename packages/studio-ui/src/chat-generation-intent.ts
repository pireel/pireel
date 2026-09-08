/**
 * Generation intent for the chat composer. Generation is an agent tool call (generate_image /
 * generate_video / generate_audio / element compose); the composer only lets the user say WHICH kind
 * and pin the few parameters a form used to hold (ratio, count, duration). The intent travels inside
 * the user's own message as one trailing line — never in the system prompt — so the agent reads it
 * like any other instruction and the prompt prefix stays byte-stable.
 */

import { localizedTemplatePrompt, TEMPLATES_BY_TYPE } from './gen-templates';
import { t } from './i18n';

export type GenerationIntent = 'image' | 'video' | 'audio' | 'element';
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
  /** video 4–15 s · audio: ≤ 22 s is a sound effect, ≥ 30 s a music track (the ladder decides the model) */
  durationSec?: number;
  /** audio only: a chosen voice turns the message into a narration script (speech synthesis). */
  voiceId?: string;
  /** video only: synthesize sound with the picture. */
  generateAudio?: boolean;
}

/** Audio has one mode; the duration ladder picks the generator: short = sound effect, long = music. */
export const AUDIO_DURATION_LADDER = [3, 5, 10, 15, 30, 60, 120, 180] as const;
export type AudioKind = 'music' | 'sfx' | 'speech';
export function audioKindFor(params: GenerationParams): AudioKind {
  if (params.voiceId) return 'speech';
  return (params.durationSec ?? 60) <= 22 ? 'sfx' : 'music';
}

export const GENERATION_INTENTS: readonly { id: GenerationIntent; label: string }[] = [
  { id: 'image', label: 'chatGen.intentImage' },
  { id: 'video', label: 'chatGen.intentVideo' },
  { id: 'audio', label: 'chatGen.intentAudio' },
  { id: 'element', label: 'chatGen.intentElement' },
];

export const RATIO_OPTIONS: readonly NonNullable<GenerationParams['ratio']>[] = ['9:16', '16:9', '1:1'];
export const IMAGE_COUNT_OPTIONS = [1, 2, 4] as const;
export const VIDEO_DURATION_OPTIONS = [5, 10, 15] as const;

/** The trailing instruction line appended to the user's message. English on purpose: it is read by
 * the model, not shown as UI; the user's own words above it stay in their language. */
export function generationIntentLine(intent: GenerationIntent, params: GenerationParams): string {
  const facts: string[] = [];
  if (params.modelId && (intent === 'image' || intent === 'video')) facts.push(`model ${params.modelId}`);
  if (params.ratio && (intent === 'image' || intent === 'video')) facts.push(`aspect ${params.ratio}`);
  if (params.count && intent === 'image') facts.push(`count ${params.count}`);
  if (params.quality && intent === 'image') facts.push(`quality ${params.quality}`);
  if (params.resolution && intent === 'video') facts.push(`resolution ${params.resolution}`);
  const audioKind = intent === 'audio' ? audioKindFor(params) : null;
  if (audioKind === 'speech' && params.voiceId) facts.push(`voice ${params.voiceId}`);
  if (params.durationSec && (intent === 'video' || (intent === 'audio' && audioKind !== 'speech'))) facts.push(`duration ${params.durationSec}s`);
  if (intent === 'video' && params.generateAudio !== undefined) facts.push(params.generateAudio ? 'with sound' : 'no sound');
  const kind: Record<GenerationIntent, string> = {
    image: 'an image',
    video: 'a video clip',
    audio: audioKind === 'speech'
      ? 'narration speech from my text as the exact script'
      : audioKind === 'sfx' ? 'a sound effect (kind sfx)' : 'a music track (kind music)',
    element: 'an on-screen graphic element (compose_component)',
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
  if (intent === 'audio') {
    const keys = ['chatGen.audioIdea1', 'chatGen.audioIdea2', 'chatGen.audioIdea3', 'chatGen.audioIdea4', 'chatGen.sfxIdea2', 'chatGen.sfxIdea3'];
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

/** Recognize the intent line inside a user message so the chat can render it as a chip. */
export function describeGenerationIntentLine(text: string): { intent: GenerationIntent | 'speech'; facts: string } | null {
  const match = /^\s*\(Generate (an image|a video clip|a music track \(kind music\)|a sound effect \(kind sfx\)|narration speech[^—;]*|an on-screen graphic element[^—;]*)(?: — ([^;]+))?;/.exec(text);
  if (!match) return null;
  const head = match[1]!;
  const intent: GenerationIntent | 'speech' = head.startsWith('an image') ? 'image'
    : head.startsWith('a video') ? 'video'
      : head.startsWith('narration') ? 'speech'
        : head.startsWith('an on-screen') ? 'element'
          : 'audio';
  return { intent, facts: (match[2] ?? '').trim() };
}
