import { getCaptionPreset, type CaptionPreset } from './caption-presets';

export const CAPTION_ANIMATIONS = [
  { id: 'none', hint: 'static', name: 'engine.captionMotionNone' },
  { id: 'fade', hint: 'whole caption fades in', name: 'engine.captionFade', motion: 'fade' },
  { id: 'rise', hint: 'rises in', name: 'engine.captionRise', motion: 'rise' },
  { id: 'pop', hint: 'pops in', name: 'engine.captionPop', motion: 'pop' },
  { id: 'slide', hint: 'slides in from the left', name: 'engine.captionSlide', motion: 'slide' },
  { id: 'blur', hint: 'unblurs in', name: 'engine.captionBlur', motion: 'blur' },
  { id: 'typewriter', hint: 'words appear as spoken', name: 'engine.captionTypewriter', motion: 'typewriter' },
  { id: 'karaoke', hint: 'spoken word changes color', name: 'engine.captionKaraoke', emphasis: '#ffe34f' },
  { id: 'underline', hint: 'underline follows the spoken word', name: 'engine.captionUnderline', deco: 'underline', decoColor: '#ffe34f' },
  { id: 'marker', hint: 'marker box behind the spoken word', name: 'engine.captionMarker', deco: 'highlight', decoColor: '#7040b8' },
  { id: 'pulse', hint: 'spoken word pulses', name: 'engine.captionPulse', motion: 'pop', wordMotion: 'pulse', emphasis: '#ffe34f' },
  { id: 'bounce', hint: 'spoken word bounces', name: 'engine.captionBounce', motion: 'rise', wordMotion: 'bounce', emphasis: '#5affb6' },
  { id: 'glow', hint: 'spoken word glows', name: 'engine.captionGlow', wordMotion: 'glow', emphasis: '#72d7ff' },
] as const;
export type CaptionAnimationId = typeof CAPTION_ANIMATIONS[number]['id'];
export const CAPTION_ANIMATION_IDS = CAPTION_ANIMATIONS.map(effect => effect.id);
export function isCaptionAnimation(value: unknown): value is CaptionAnimationId {
  return typeof value === 'string' && CAPTION_ANIMATION_IDS.includes(value as CaptionAnimationId);
}
/** Read old bundled presets without rewriting historical documents. */
export function captionAnimationId(style: { preset?: string; animation?: string }): CaptionAnimationId {
  if (isCaptionAnimation(style.animation)) return style.animation;
  const preset = getCaptionPreset(style.preset);
  return preset.wordMotion ?? (preset.deco === 'highlight' ? 'marker' : preset.deco === 'underline' ? 'underline' : preset.motion ?? (preset.mode === 'emphasis' ? 'karaoke' : 'none'));
}
export function animatedCaptionPreset(preset: CaptionPreset, animation?: string): CaptionPreset {
  if (!isCaptionAnimation(animation)) return preset;
  const effect: Partial<CaptionPreset> = CAPTION_ANIMATIONS.find(item => item.id === animation)!;
  return { ...preset, mode: effect.wordMotion || effect.emphasis || effect.deco ? 'emphasis' : 'line',
    motion: effect.motion, wordMotion: effect.wordMotion, emphasis: effect.emphasis, deco: effect.deco, decoColor: effect.decoColor };
}

/** Color for emphasized words: the user's highlight override, else the animation's own color.
 *  Manual word highlights without a chosen color use this too, so key words follow the style. */
export function captionHighlightColor(style: { preset?: string; animation?: string; emphasis?: string }): string {
  if (style.emphasis) return style.emphasis;
  const effective = animatedCaptionPreset(getCaptionPreset(style.preset), captionAnimationId(style));
  return effective.emphasis ?? effective.decoColor ?? DEFAULT_HIGHLIGHT;
}
export const DEFAULT_HIGHLIGHT = '#ffe34f';
