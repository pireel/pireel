import { brandEditingSkills, brandPreferences } from './brand-preferences';
import type { PlaybookSnapshot } from './brand-playbook';
import { EDITING_SKILL_IDS } from './editing-skills';
export const HOME_VIDEO_EDITING_SKILL = 'talking-head-edit';

/** Immutable input to one editing task. Brand presence never selects a different executor. */
export interface EditingRunConfig {
  brand: PlaybookSnapshot | null;
  skills: string[];
  pauses: 'tight' | 'moderate' | 'natural';
  visual: { headlines: boolean; zoom: boolean; transitions: boolean };
  steps: Record<'transcribe' | 'pauses' | 'cleanup' | 'captions' | 'denoise' | 'logo' | 'loudness', boolean>;
}

export function resolveEditingRunConfig(input: { brand?: PlaybookSnapshot | null; skills?: readonly string[]; pauses?: EditingRunConfig['pauses'] }): EditingRunConfig {
  const brand = input.brand ? structuredClone(input.brand) : null;
  const skills = EDITING_SKILL_IDS.filter(id => (input.skills ?? (brand ? brandEditingSkills(brand) : ['rough-cut', 'captions'])).includes(id));
  const on = new Set(skills);
  const pauses = input.pauses ?? brand?.blocks.sound?.pauses ?? 'moderate';
  const visual = brand ? brandPreferences(brand) : { headlines: false, zoom: false, transitions: false };
  return { brand, skills, pauses, visual: { headlines: visual.headlines, zoom: visual.zoom, transitions: visual.transitions }, steps: {
    transcribe: on.has('rough-cut') || on.has('captions'),
    pauses: on.has('rough-cut') && (brand?.preferences?.pauses ?? pauses !== 'natural'),
    cleanup: on.has('rough-cut') && (brand?.preferences?.cleanup ?? true),
    captions: on.has('captions'), denoise: on.has('voice-cleanup'),
    logo: !!brand?.blocks.logo, loudness: brand?.blocks.sound?.lufs !== undefined,
  } };
}
