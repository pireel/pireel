import type { BrandPlaybook } from './brand-playbook';

export const BRAND_PREFERENCE_IDS = ['pauses', 'cleanup', 'denoise', 'broll', 'graphics', 'sound', 'transitions', 'zoom', 'headlines'] as const;
export type BrandPreferenceId = typeof BRAND_PREFERENCE_IDS[number];
// Read the briefly exposed layout flag for compatibility only. Multi-speaker layout will use
// explicit fixed presets (top/bottom, side-by-side, three or four panes), not agent discretion.
export type BrandPreferences = Partial<Record<BrandPreferenceId, boolean>> & { layout?: boolean };
type BrandSettings = Pick<BrandPlaybook, 'blocks' | 'skills' | 'preferences'>;

/** Defaults preserve old brands; an explicit off always wins over descriptive prose. */
export function brandPreferences(brand: BrandSettings): Record<BrandPreferenceId, boolean> {
  const skills = new Set(brand.skills ?? []);
  const b = brand.blocks;
  const { layout: _reservedLayout, ...preferences } = brand.preferences ?? {};
  const describedMoves = [b.camera, b.transitions, b.layout].some(block => !!block?.text?.trim());
  return {
    pauses: skills.has('rough-cut') && b.sound?.pauses !== 'natural',
    cleanup: skills.has('rough-cut'), denoise: skills.has('voice-cleanup'),
    broll: skills.has('b-roll'), graphics: skills.has('graphics'), sound: skills.has('sound'),
    transitions: describedMoves, zoom: describedMoves, headlines: !!b.overlay_text?.text?.trim(),
    ...preferences,
  };
}

/** Existing execution skills are derived from the brand's controls, then frozen on the new project. */
export function brandEditingSkills(brand: BrandSettings): string[] {
  const p = brandPreferences(brand);
  return [
    ...(p.graphics ? ['graphics'] : []),
    ...(brand.blocks.captions?.on ? ['captions'] : []),
    ...(p.pauses || p.cleanup ? ['rough-cut'] : []),
    ...(p.denoise ? ['voice-cleanup'] : []),
    ...(p.broll ? ['b-roll'] : []), ...(p.sound ? ['sound'] : []),
  ];
}
