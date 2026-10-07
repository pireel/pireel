'use client';

/**
 * The brand the project is edited with, beside the Skill picker: shows it, and lets the creator switch it
 * or edit without one. Later edits follow the new brand; what is already edited stays as it is.
 */

import { useState } from 'react';
import { Check, ChevronDown, Plus, Stamp } from 'lucide-react';
import type { PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@pireel/ui/dropdown-menu';
import { t } from './i18n';

export function ChatBrandPicker({ brand, brands, disabled, onChange }: {
  /** The project's brand (null: none picked; undefined: never set). */
  brand: PlaybookSnapshot | null | undefined;
  brands: { list: () => Promise<PlaybookSnapshot[]>; manage?: () => void };
  disabled?: boolean;
  onChange: (brand: PlaybookSnapshot | null) => void;
}) {
  const [options, setOptions] = useState<PlaybookSnapshot[] | null>(null);
  const load = () => { void brands.list().then(setOptions, () => setOptions([])); };
  const pick = (to: PlaybookSnapshot | null) => {
    if (to && brand && to.id === brand.id && to.version === brand.version) return;
    if (!to && !brand) return;
    onChange(to);
  };
  return <>
    <DropdownMenu onOpenChange={(open) => { if (open) load(); }}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" title={t('chatGen.brand.title')}
          className="text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 max-w-[160px] items-center gap-1 rounded-md px-1.5 text-[11.5px] disabled:pointer-events-none disabled:opacity-30">
          <Stamp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          <span className="truncate">{brand ? brand.name : t('chatGen.brand.none')}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {options === null
          ? <DropdownMenuItem disabled>{t('chatGen.brand.loading')}</DropdownMenuItem>
          : options.map((option) => <DropdownMenuItem key={option.id} onSelect={() => pick(option)}>
            <span className="min-w-0 flex-1 truncate">{option.name}</span>{brand?.id === option.id && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>)}
        <DropdownMenuItem onSelect={() => pick(null)}>
          <span className="flex-1">{t('chatGen.brand.none')}</span>{!brand && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        {brands.manage && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => brands.manage!()}><Plus className="h-3.5 w-3.5" />{t('chatGen.brand.manage')}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  </>;
}
