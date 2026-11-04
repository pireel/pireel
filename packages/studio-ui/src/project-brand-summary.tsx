import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, Palette, Plus } from 'lucide-react';
import { brandPreferences, type BrandPlaybook, type PlaybookSnapshot } from '@pireel/studio-engine/project-brand-metadata';
import { studioProviders } from '@pireel/studio-engine/providers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pireel/ui/dropdown-menu';
import { t } from './i18n';

/** The project's brand: the creator picks one of their brands or none, and later edits follow it. The
 *  list loads each time the menu opens, so a brand made in another tab shows up. */
export function ProjectBrandPicker({ brand, disabled, onChange }: {
  brand: PlaybookSnapshot | null | undefined;
  disabled?: boolean;
  onChange: (brand: PlaybookSnapshot | null) => void;
}) {
  const provider = studioProviders().brands;
  const [options, setOptions] = useState<BrandPlaybook[] | null>(null);
  if (!provider) return <ProjectBrandSummary brand={brand} />;
  const load = () => { void provider.list().then((list) => setOptions(list), () => setOptions([])); };
  return <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
    <DropdownMenuTrigger asChild disabled={disabled}>
      <button type="button" aria-label={t('ui.projectBrandSummary.projectBrand')} className="text-ink-2 hover:bg-panel-2 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] disabled:pointer-events-none disabled:opacity-40">
        <Palette size={13} className="shrink-0" /><span className="truncate">{brand ? brand.name : t('ui.projectBrandSummary.noBrand')}</span><ChevronDown size={12} className="shrink-0" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" sideOffset={6} className="studio-scope z-[100] min-w-52 max-w-[calc(100vw-2rem)]">
      {/* The brand list scrolls on its own, so Manage stays in reach. Choosing the checked brand
          again clears it: no brand is simply nothing checked. */}
      <div className="max-h-60 overflow-y-auto">
        {options === null
          ? <DropdownMenuItem disabled>{t('ui.projectBrandSummary.loading')}</DropdownMenuItem>
          : options.map((option) => <DropdownMenuItem key={option.id} onSelect={() => onChange(brand?.id === option.id ? null : option)}>
            <span className="min-w-0 flex-1 truncate">{option.name}</span>{brand?.id === option.id && <Check size={14} />}
          </DropdownMenuItem>)}
      </div>
      {provider.manage && <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => provider.manage!()}><Plus size={14} />{t('ui.projectBrandSummary.manageBrands')}</DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function ProjectBrandSummary({ brand }: { brand: PlaybookSnapshot | null | undefined }) {
  if (!brand) return <span className="text-ink-4 px-1 text-[11px]">{t('ui.projectBrandSummary.noBrand')}</span>;
  const p = brandPreferences(brand);
  const enabled = [
    [brand.blocks.captions?.on, t('ui.projectBrandSummary.captions')], [p.headlines, t('ui.projectBrandSummary.headlines')],
    [p.cleanup, t('ui.projectBrandSummary.cleanUpSpeech')], [p.pauses, t('ui.projectBrandSummary.trimPauses')],
    [p.graphics, t('ui.projectBrandSummary.graphics')], [p.broll, 'B-roll'], [p.sound, t('ui.projectBrandSummary.soundEffects')],
    [p.zoom, t('ui.projectBrandSummary.autoZoom')], [p.denoise, t('ui.projectBrandSummary.denoise')],
  ].filter(([on]) => on).map(([, label]) => String(label));
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" aria-label={t('ui.projectBrandSummary.projectBrandNamed', { name: brand.name })} className="text-ink-2 hover:bg-panel-2 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]"><Palette size={13} className="shrink-0" /><span className="truncate">{brand.name}</span><ChevronDown size={12} className="shrink-0" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} collisionPadding={16} className="studio-scope bg-panel border-line z-[100] max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border p-4 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3"><p className="text-ink text-sm font-medium">{brand.name}</p><span className="text-ink-4 shrink-0 text-xs">v{brand.version}</span></div>
      {enabled.length > 0 && <p className="text-ink-2 mb-3 text-xs leading-6">{enabled.join(' · ')}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
