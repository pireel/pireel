import { getCaptionPreset } from '@pireel/studio-engine/caption-presets';
import { CAPTION_EXAMPLES } from './caption-examples';

export function CaptionExampleCards({ locale, selected, onSelect, disabled = false, compact = false, showCaptions = true }: {
  locale: 'zh' | 'en'; selected?: string; onSelect?: (preset: string) => void; disabled?: boolean; compact?: boolean; showCaptions?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5" role={onSelect ? 'group' : undefined} aria-label={onSelect ? (locale === 'zh' ? '选择字幕样式' : 'Choose a caption style') : undefined}>
      {CAPTION_EXAMPLES.map((example) => {
        const preset = getCaptionPreset(example.preset);
        const visual = <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-200">
          <img src={example.image} alt="" width={384} height={576} loading={compact ? 'lazy' : 'eager'} className="h-full w-full object-cover" />
          <div className="absolute inset-x-1 bottom-[17%] text-center" aria-hidden style={{ visibility: showCaptions ? 'visible' : 'hidden' }}>
            <span style={{ color: preset.text, background: preset.bg, textShadow: preset.bg ? undefined : '0 1px 3px #000, 0 0 6px #0008', fontWeight: 500 }} className="inline-block rounded-sm px-1.5 py-1 text-[clamp(11px,1.3vw,16px)] leading-tight">
              {locale === 'zh' ? '把想法' : 'Make your'}{' '}
              <span style={{ color: preset.emphasis }}>{locale === 'zh' ? '讲清楚' : 'words count'}</span>
            </span>
          </div>
        </div>;
        return onSelect
          ? <button key={example.preset} type="button" aria-pressed={selected === example.preset} disabled={disabled} onClick={() => onSelect(example.preset)} className={'rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed ' + (selected === example.preset ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--color-bg)]' : 'opacity-80 hover:opacity-100')}>
            {visual}<span className="text-ink block py-2 text-center text-xs">{example.title[locale]}</span>
          </button>
          : <div key={example.preset}>{visual}</div>;
      })}
    </div>
  );
}
