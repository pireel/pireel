import { AGENT_ENTRY_ICON, CAPTIONS_ENTRY_ICON } from './workflow-art';

export function WorkflowLauncher({ locale, onSelect, onCreateAgent }: { locale: 'zh' | 'en'; onSelect: (id: string) => void; onCreateAgent?: () => void }) {
  return <div className="mb-8 flex gap-4">
    <button type="button" onClick={() => onSelect('captions')} aria-label={locale === 'zh' ? 'AI 字幕' : 'AI Captions'} className="text-ink group flex w-24 flex-col items-center gap-2 rounded-lg py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent"><img src={CAPTIONS_ENTRY_ICON} width={56} height={56} alt="" className="size-14 object-contain transition-transform group-hover:scale-105" /><span>AI Captions</span></button>
    {onCreateAgent && <button type="button" onClick={onCreateAgent} className="text-ink group flex w-24 flex-col items-center gap-2 rounded-lg py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent"><img src={AGENT_ENTRY_ICON} width={56} height={56} alt="" className="size-14 object-contain transition-transform group-hover:scale-105" /><span>Agent Editor</span></button>}
  </div>;
}
