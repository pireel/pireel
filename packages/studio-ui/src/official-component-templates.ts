import type { LibraryItem } from './asset-card';
import type { GenTemplate } from './gen-templates';
import { localizedTemplatePrompt } from './gen-templates';
import { artDirectedTemplateElement } from './gen-templates/element-presets';
import { t } from './i18n';

/** Normalize a generated-component template into the standard Official Assets card model.
 *  The same element object drives the tile, lightbox, drag payload, and final insertion. */
export function officialComponentTemplateItem(template: GenTemplate, locale: string): LibraryItem | null {
  const prompt = localizedTemplatePrompt(template, locale);
  const label = template.title ? t(template.title) : prompt;
  const element = artDirectedTemplateElement(template, label);
  if (!element) return null;
  return {
    id: `template:${template.id}`,
    kind: 'element',
    origin: 'preset',
    category: template.category,
    label,
    element,
    prompt,
    createdAt: 0,
    deletable: false,
  };
}
