import { Captions } from 'lucide-react';

export function WorkflowLauncher({ locale, onSelect }: { locale: 'zh' | 'en'; onSelect: (id: string) => void }) {
  return <div className="mb-8 flex gap-4"><button type="button" onClick={() => onSelect('captions')} aria-label={locale === 'zh' ? 'AI 字幕' : 'AI Captions'} className="text-ink group flex w-24 flex-col items-center gap-2 rounded-lg py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent"><span className="bg-panel group-hover:bg-panel-2 flex size-14 items-center justify-center rounded-full"><Captions size={27} strokeWidth={1.6} /></span><span>AI Captions</span></button></div>;
}
