import type { BrandPlaybook } from './brand-playbook';

export const BRAND_PREFERENCE_IDS = ['cover', 'pauses', 'cleanup', 'denoise', 'broll', 'graphics', 'sound', 'zoom', 'headlines', 'logo', 'intro', 'outro', 'music', 'loudness'] as const;
export type BrandPreferenceId = typeof BRAND_PREFERENCE_IDS[number];
// Read the briefly exposed layout flag for compatibility only. Multi-speaker layout will use
// explicit fixed presets (top/bottom, side-by-side, three or four panes), not agent discretion.
export type BrandPreferences = Partial<Record<BrandPreferenceId, boolean>> & { layout?: boolean; /** Legacy only; ignored by all brand consumers. */ transitions?: boolean };
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

/** Transition decisions belong to the main editing prompt, never to saved brand switches. */
export function upgradeBrandPreferences<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'transitions')) return value;
  const { transitions: _retired, ...preferences } = value as Record<string, unknown>;
  return preferences as T;
}
