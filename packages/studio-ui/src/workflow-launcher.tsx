import { ArrowUpRight } from 'lucide-react';
import { CaptionExampleCards } from './caption-example-cards';

/** Only consumer-ready scenarios belong here. Atomic capabilities remain in the engine catalog. */
export function WorkflowLauncher({ locale, onSelect }: { locale: 'zh' | 'en'; onSelect: (id: string) => void }) {
  const zh = locale === 'zh';
  return (
    <div className="mb-12 space-y-4">
    <section aria-label={zh ? 'AI 字幕' : 'AI captions'} className="border-line bg-panel grid overflow-hidden rounded-xl border sm:grid-cols-2">
      <div className="flex flex-col items-start justify-center p-6 sm:p-8">
        <h2 className="text-ink text-2xl font-semibold tracking-tight">{zh ? '给视频加字幕' : 'Give your video a voice on screen'}</h2>
        <p className="text-ink-3 mb-6 mt-3 max-w-sm text-sm leading-relaxed">{zh ? '上传视频，自动识别讲话，配上喜欢的字幕样式。' : 'Upload a video. Turn speech into styled, editable captions.'}</p>
        <button type="button" onClick={() => onSelect('captions')} className="bg-ink text-bg inline-flex h-11 items-center gap-3 rounded-md px-5 text-sm font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          {zh ? '开始加字幕' : 'Add captions'}<ArrowUpRight size={16} />
        </button>
      </div>
      <div className="bg-bg p-5 sm:p-6"><CaptionExampleCards locale={locale} compact /></div>
    </section>
    <section aria-label={zh ? '口播精剪' : 'Talking-head editing'} className="border-line bg-panel flex flex-col overflow-hidden rounded-xl border sm:flex-row">
      <div className="flex flex-1 flex-col items-start justify-center p-6 sm:p-8">
        <h2 className="text-ink text-2xl font-semibold tracking-tight">{zh ? '把口播，剪得更好看' : 'Give your recording a polished first cut'}</h2>
        <p className="text-ink-3 mb-5 mt-3 max-w-md text-sm leading-relaxed">{zh ? '选好讲述节奏，自动整理长停顿、加字幕、突出重点。完成后，每一处都能继续修改。' : 'Choose a pace. Shorten pauses, add captions and bring key phrases forward. Keep every edit in your hands.'}</p>
        <button type="button" onClick={() => onSelect('talking-head')} className="bg-ink text-bg inline-flex h-11 items-center gap-3 rounded-md px-5 text-sm font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{zh ? '开始剪口播' : 'Polish my video'}<ArrowUpRight size={16} /></button>
      </div>
      <div className="bg-bg relative min-h-64 sm:w-[38%]">
        <img src={new URL('./workflow-art/caption-creator.webp', import.meta.url).href} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-[center_28%]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-6 pt-16 text-center"><p className="text-lg font-semibold text-white">{zh ? '让每一句话' : 'Make every word'}<br /><span className="text-[#ffe34f]">{zh ? '都讲到重点' : 'count'}</span></p><p className="mt-2 text-[11px] text-white/70">{zh ? '口播效果示意' : 'Illustrative caption treatment'}</p></div>
      </div>
    </section>
    </div>
  );
}
