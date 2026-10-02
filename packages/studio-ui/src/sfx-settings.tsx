import { SFX_DENSITIES } from '@pireel/studio-engine/sfx-plan';
import { normalizeSfxOptions, type SfxOptions } from '@pireel/studio-engine/sfx-task';
export function SfxSettings({ value, onChange, disabled, locale }: { value: SfxOptions; onChange: (value: SfxOptions) => void; disabled: boolean; locale: 'zh' | 'en' }) {
  const current = normalizeSfxOptions(value);
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend className="text-ink mb-3 text-sm font-medium">{locale === 'zh' ? '音效密度' : 'Sound effect density'}</legend>
    <div role="radiogroup" aria-label={locale === 'zh' ? '音效密度' : 'Sound effect density'} className="grid grid-cols-3 gap-2">
      {SFX_DENSITIES.map((density, index) => <button key={density.id} type="button" role="radio" aria-checked={current.density === density.id} tabIndex={current.density === density.id ? 0 : -1} disabled={disabled} onClick={() => onChange({ density: density.id })} onKeyDown={event => {
        const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : delta ? (index + delta + 3) % 3 : -1;
        if (next < 0) return; event.preventDefault(); onChange({ density: SFX_DENSITIES[next].id }); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }} className={'min-w-0 rounded-lg border px-2 py-4 text-center focus-visible:outline-2 focus-visible:outline-accent ' + (current.density === density.id ? 'border-ink bg-panel text-ink' : 'border-line text-ink-3 hover:bg-panel')}>
        <span aria-hidden="true" className="mb-3 flex h-5 items-end justify-center gap-1">{Array.from({ length: index * 2 + 2 }, (_, bar) => <span key={bar} className="w-1 rounded-full bg-current" style={{ height: bar % 2 ? '100%' : '60%' }}/>)}</span>
        <span className="text-sm font-medium">{density[locale]}</span>
      </button>)}
    </div>
    <p className="text-ink text-sm">{SFX_DENSITIES.find(density => density.id === current.density)!.description[locale]}</p>
    <p className="text-ink-3 text-xs leading-relaxed">{locale === 'zh' ? 'AI 根据内容选择音效和时机，音量按原声自动调整。不合适的地方不添加。' : 'AI selects sounds and timing. Volume adapts to the original speech; unsuitable moments are left untouched.'}</p>
  </fieldset>;
}
