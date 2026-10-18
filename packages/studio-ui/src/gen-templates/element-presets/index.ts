import type { GenElementResult } from '@pireel/studio-ui/element-history';
import type { GenTemplate } from '@pireel/studio-ui/gen-templates/types';
import { ACCENT_ELEMENT_PRESETS } from '@pireel/studio-ui/gen-templates/element-presets/accent';
import { DATA_ELEMENT_PRESETS } from '@pireel/studio-ui/gen-templates/element-presets/data';
import { STORY_ELEMENT_PRESETS } from '@pireel/studio-ui/gen-templates/element-presets/story';
import type { ArtDirectedElementSpec } from '@pireel/studio-ui/gen-templates/element-presets/shared';

const ELEMENT_PRESETS: Record<string, ArtDirectedElementSpec> = {
  ...DATA_ELEMENT_PRESETS,
  ...STORY_ELEMENT_PRESETS,
  ...ACCENT_ELEMENT_PRESETS,
};

/** Hydrate the insertable visual with localized library metadata. */
export function artDirectedTemplateElement(template: GenTemplate, label: string): GenElementResult | null {
  const preset = ELEMENT_PRESETS[template.id];
  if (!preset) return null;
  return { ...preset, label, presetId: template.presetId ?? preset.presetId };
}

export const artDirectedTemplateIds = (): string[] => Object.keys(ELEMENT_PRESETS);
