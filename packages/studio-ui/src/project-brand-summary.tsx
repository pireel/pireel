import { Popover } from 'radix-ui';
import { ChevronDown, Palette } from 'lucide-react';
import { type PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { brandPreferences } from '@pireel/studio-engine/brand-preferences';
import { studioLocale } from '@pireel/studio-ui/i18n';
import { t } from './i18n';

export function ProjectBrandSummary({ brand }: { brand: PlaybookSnapshot | null | undefined }) {
  const zh = studioLocale().startsWith('zh');
  if (!brand) return <span className="text-ink-4 px-1 text-[11px]">{t('ui.projectBrandSummary.noBrand')}</span>;
  const p = brandPreferences(brand);
  const enabled = [
    [brand.blocks.captions?.on, t('ui.projectBrandSummary.captions')], [p.headlines, t('ui.projectBrandSummary.headlines')],
    [p.cleanup, t('ui.projectBrandSummary.cleanUpSpeech')], [p.pauses, t('ui.projectBrandSummary.trimPauses')],
    [p.graphics, t('ui.projectBrandSummary.graphics')], [p.broll, 'B-roll'], [p.sound, t('ui.projectBrandSummary.soundEffects')],
    [p.zoom, t('ui.projectBrandSummary.autoZoom')], [p.denoise, t('ui.projectBrandSummary.denoise')],
  ].filter(([on]) => on).map(([, label]) => String(label));
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" aria-label={`${t('ui.projectBrandSummary.projectBrand')}：${brand.name}`} className="text-ink-2 hover:bg-panel-2 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]"><Palette size={13} className="shrink-0" /><span className="truncate">{brand.name}</span><ChevronDown size={12} className="shrink-0" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} collisionPadding={16} className="studio-scope bg-panel border-line z-[100] max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border p-4 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3"><p className="text-ink text-sm font-medium">{brand.name}</p><span className="text-ink-4 shrink-0 text-xs">v{brand.version}</span></div>
      {enabled.length > 0 && <p className="text-ink-2 mb-3 text-xs leading-6">{enabled.join(' · ')}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
