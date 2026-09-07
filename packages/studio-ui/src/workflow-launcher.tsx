import { ArrowUpRight } from 'lucide-react';
import { CaptionExampleCards } from './caption-example-cards';

/** Only consumer-ready scenarios belong here. Atomic capabilities remain in the engine catalog. */
export function WorkflowLauncher({ locale, onSelect }: { locale: 'zh' | 'en'; onSelect: (id: string) => void }) {
  const zh = locale === 'zh';
  return (
    <div className="mb-12 space-y-4">
    <section aria-label={zh ? 'AI 字幕' : 'AI Captions'} className="border-line bg-panel grid overflow-hidden rounded-xl border sm:grid-cols-2">
      <div className="flex flex-col items-start justify-center p-6 sm:p-8">
        <h2 className="text-ink text-2xl font-semibold tracking-tight">{zh ? 'AI 字幕' : 'AI Captions'}</h2>
        <p className="text-ink-3 mb-6 mt-3 max-w-sm text-sm leading-relaxed">{zh ? '上传视频，自动识别讲话，配上喜欢的字幕样式。' : 'Upload a video. Turn speech into styled, editable captions.'}</p>
        <button type="button" onClick={() => onSelect('captions')} className="bg-ink text-bg inline-flex h-11 items-center gap-3 rounded-md px-5 text-sm font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          {zh ? '开始加字幕' : 'Add captions'}<ArrowUpRight size={16} />
        </button>
      </div>
      <div className="bg-bg p-5 sm:p-6"><CaptionExampleCards locale={locale} compact /></div>
    </section>
    </div>
  );
}
