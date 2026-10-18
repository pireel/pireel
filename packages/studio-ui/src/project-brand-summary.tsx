import { Popover } from 'radix-ui';
import { ChevronDown, Palette } from 'lucide-react';
import { type PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { brandPreferences } from '@pireel/studio-engine/brand-preferences';
import { studioLocale } from './i18n';

export function ProjectBrandSummary({ brand }: { brand: PlaybookSnapshot | null | undefined }) {
  const zh = studioLocale().startsWith('zh');
  if (!brand) return <span className="text-ink-4 px-1 text-[11px]">{zh ? '未使用品牌' : 'No brand'}</span>;
  const p = brandPreferences(brand);
  const enabled = [
    [brand.blocks.captions?.on, zh ? '字幕' : 'Captions'], [p.headlines, zh ? '花字' : 'Headlines'],
    [p.cleanup, zh ? '清理口播' : 'Clean up speech'], [p.pauses, zh ? '缩短停顿' : 'Trim pauses'],
    [p.graphics, zh ? '动态图形' : 'Graphics'], [p.broll, 'B-roll'], [p.sound, zh ? '音效' : 'Sound effects'],
    [p.zoom, zh ? '自动缩放' : 'Auto zoom'], [p.denoise, zh ? '降噪' : 'Denoise'],
  ].filter(([on]) => on).map(([, label]) => String(label));
  return <Popover.Root>
    <Popover.Trigger asChild><button type="button" aria-label={`${zh ? '项目品牌' : 'Project brand'}：${brand.name}`} className="text-ink-2 hover:bg-panel-2 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]"><Palette size={13} className="shrink-0" /><span className="truncate">{brand.name}</span><ChevronDown size={12} className="shrink-0" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="top" align="start" sideOffset={8} collisionPadding={16} className="studio-scope bg-panel border-line z-[100] max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border p-4 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3"><p className="text-ink text-sm font-medium">{brand.name}</p><span className="text-ink-4 shrink-0 text-xs">v{brand.version}</span></div>
      {enabled.length > 0 && <p className="text-ink-2 mb-3 text-xs leading-6">{enabled.join(' · ')}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
