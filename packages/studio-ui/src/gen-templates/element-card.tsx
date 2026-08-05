'use client';

import { Blocks } from 'lucide-react';
import { ElementTile, type LibraryItem } from '../asset-card';
import { studioLocale, t } from '../i18n';
import { artDirectedTemplateElement } from './element-presets';
import { localizedTemplatePrompt, type GenTemplate } from './types';

/** Generation keeps Remix semantics, but renders the same insertable element as Official Assets. */
export function ElementTemplateCard({ template, onUse }: { template: GenTemplate; onUse: (prompt: string) => void }) {
  const prompt = localizedTemplatePrompt(template, studioLocale());
  const label = template.title ? t(template.title) : prompt;
  const element = artDirectedTemplateElement(template, label);
  const item: LibraryItem | null = element
    ? {
        id: `template:${template.id}`,
        kind: 'element',
        origin: 'preset',
        category: template.category,
        label,
        element,
        prompt,
        createdAt: 0,
        deletable: false,
      }
    : null;
  return (
    <button
      type="button"
      title={prompt}
      aria-label={`${label} · ${t('chatGen.remix')}`}
      onClick={() => onUse(prompt)}
      className="border-line group relative block w-full overflow-hidden rounded-lg border text-left"
    >
      {item ? (
        <ElementTile item={item} />
      ) : (
        <div className="bg-panel-2 relative aspect-video w-full">
          <Blocks size={24} className="text-ink-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100">
        <span className="text-ink rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium">
          {label} · {t('chatGen.remix')}
        </span>
      </span>
    </button>
  );
}
