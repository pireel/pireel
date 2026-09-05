/**
 * Generation intent for the chat composer. Generation is an agent tool call (generate_image /
 * generate_video / generate_audio / element compose); the composer only lets the user say WHICH kind
 * and pin the few parameters a form used to hold (ratio, count, duration). The intent travels inside
 * the user's own message as one trailing line — never in the system prompt — so the agent reads it
 * like any other instruction and the prompt prefix stays byte-stable.
 */

import { localizedTemplatePrompt, TEMPLATES_BY_TYPE } from './gen-templates';

export type GenerationIntent = 'image' | 'video' | 'audio' | 'element';
/** Composer mode: plain chat, or one generation intent that reshapes the composer. */
export type ChatMode = 'chat' | GenerationIntent;

export interface GenerationParams {
  /** image / video */
  ratio?: '9:16' | '16:9' | '1:1';
  /** image only, 1–4 */
  count?: number;
  /** video 4–15 s · audio 30–300 s */
  durationSec?: number;
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
export const AUDIO_DURATION_OPTIONS = [30, 60, 120] as const;

/** The trailing instruction line appended to the user's message. English on purpose: it is read by
 * the model, not shown as UI; the user's own words above it stay in their language. */
export function generationIntentLine(intent: GenerationIntent, params: GenerationParams): string {
  const facts: string[] = [];
  if (params.ratio && (intent === 'image' || intent === 'video')) facts.push(`aspect ${params.ratio}`);
  if (params.count && intent === 'image') facts.push(`count ${params.count}`);
  if (params.durationSec && (intent === 'video' || intent === 'audio')) facts.push(`duration ${params.durationSec}s`);
  const kind: Record<GenerationIntent, string> = {
    image: 'an image',
    video: 'a video clip',
    audio: 'an audio track',
    element: 'an on-screen graphic element',
  };
  return `(Generate ${kind[intent]}${facts.length ? ` — ${facts.join(', ')}` : ''}; register the result in the project media and place it only if I asked.)`;
}

/** A handful of curated prompts for the armed intent (the old panel's template library, as chips). */
export function generationTemplatePrompts(intent: GenerationIntent, locale: string, limit = 6): { id: string; title: string; prompt: string }[] {
  const source = TEMPLATES_BY_TYPE[intent] ?? [];
  return source.slice(0, limit).map((template) => {
    const prompt = localizedTemplatePrompt(template, locale);
    return { id: template.id, title: template.title || prompt.slice(0, 24), prompt };
  });
}
