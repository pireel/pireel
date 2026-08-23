'use client';

import { Blocks } from 'lucide-react';
import { ElementTile, type LibraryItem } from '../asset-card';
import { studioLocale, t } from '../i18n';
import { useStudioShell } from '../shell-context';
import { ELEMENT_TEMPLATES } from './element';
import { artDirectedTemplateElement } from './element-presets';
import { localizedTemplatePrompt, type GenTemplate } from './types';

function templateItem(template: GenTemplate, thumbSrc?: string | null): LibraryItem | null {
  const prompt = localizedTemplatePrompt(template, studioLocale());
  const label = template.title ? t(template.title) : prompt;
  const element = artDirectedTemplateElement(template, label);
  if (!element) return null;
  return {
    id: `template:${template.id}`,
    kind: 'element',
    origin: 'preset',
    category: template.category,
    ...(thumbSrc ? { thumbSrc } : {}),
    label,
    element,
    prompt,
    createdAt: 0,
    deletable: false,
  };
}

function TemplateVisual({ item }: { item: LibraryItem | null }) {
  return item ? (
    <ElementTile item={item} />
  ) : (
    <div className="bg-panel-2 relative aspect-video w-full">
      <Blocks size={24} className="text-ink-4 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

/** Shared full-fidelity component preview used by generation cards, dialogs, and chat search. */
export function ElementTemplatePreview({ id }: { id: string }) {
  const shell = useStudioShell();
  const template = ELEMENT_TEMPLATES.find((candidate) => candidate.id === id);
  const thumbSrc = template ? shell.curatedAssets?.componentThumbnail?.('template', template.id) : null;
  return <TemplateVisual item={template ? templateItem(template, thumbSrc) : null} />;
}

/** Generation keeps Remix semantics while rendering the same component that Official Assets inserts. */
export function ElementTemplateCard({
  template,
  onUse,
  onPreview,
}: {
  template: GenTemplate;
  onUse: (prompt: string) => void;
  /** Generation panel only: card body previews; the bottom-right action keeps Remix direct. */
  onPreview?: () => void;
}) {
  const shell = useStudioShell();
  const prompt = localizedTemplatePrompt(template, studioLocale());
  const label = template.title ? t(template.title) : prompt;
  const thumbSrc = shell.curatedAssets?.componentThumbnail?.('template', template.id);
  const item = templateItem(template, thumbSrc);

  if (onPreview) {
    return (
      <div className="border-line group relative w-full overflow-hidden rounded-lg border">
        <button
          type="button"
          title={prompt}
          aria-label={`${label} · ${t('chatGen.previewTemplate')}`}
          onClick={onPreview}
          className="block w-full cursor-zoom-in text-left"
        >
          <TemplateVisual item={item} />
        </button>
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9.5px] text-white">
          {t(template.category)}
        </span>
        <button
          type="button"
          aria-label={`${label} · ${t('chatGen.remix')}`}
          onClick={() => onUse(prompt)}
          className="absolute bottom-1.5 right-1.5 rounded-md bg-white/90 px-2 py-1 text-[10.5px] font-medium text-[#20201e] opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {t('chatGen.remix')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title={prompt}
      aria-label={`${label} · ${t('chatGen.remix')}`}
      onClick={() => onUse(prompt)}
      className="border-line group relative block w-full overflow-hidden rounded-lg border text-left"
    >
      <TemplateVisual item={item} />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100 group-focus-within:bg-black/35 group-focus-within:opacity-100">
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#20201e]">
          {label} · {t('chatGen.remix')}
        </span>
      </span>
    </button>
  );
}
