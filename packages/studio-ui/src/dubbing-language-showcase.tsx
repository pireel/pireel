import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

const GREETINGS = [
  { text: 'Hello', lang: 'en' },
  { text: 'Bonjour', lang: 'fr' },
  { text: 'Hola', lang: 'es' },
  { text: 'こんにちは', lang: 'ja' },
  { text: '안녕하세요', lang: 'ko' },
  { text: 'Olá', lang: 'pt' },
  { text: 'مرحبًا', lang: 'ar' },
  { text: 'Ciao', lang: 'it' },
  { text: 'สวัสดี', lang: 'th' },
  { text: 'Hallo', lang: 'de' },
];

export function DubbingLanguageShowcase({ locale }: { locale: 'zh' | 'en' }) {
  const [frame, setFrame] = useState({ current: 0, previous: -1 });
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (preference?.matches || document.visibilityState === 'hidden') return;
      timer = setInterval(() => setFrame(({ current }) => ({ previous: current, current: (current + 1) % GREETINGS.length })), 1600);
    };
    update();
    document.addEventListener('visibilitychange', update);
    preference?.addEventListener?.('change', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); preference?.removeEventListener?.('change', update); };
  }, []);
  return <div role="img" aria-label={locale === 'zh' ? '多语言译制示例' : 'Multilingual dubbing preview'} className="text-ink grid w-full max-w-[360px] grid-cols-[1fr_24px_1fr] items-center gap-3 text-xl font-medium sm:text-2xl">
    <span aria-hidden="true" lang="zh" className="text-right">你好</span>
    <ArrowRight aria-hidden="true" size={22} className="text-ink-4" />
    <span aria-hidden="true" className="relative block h-10 min-w-0 overflow-hidden">
      {frame.previous >= 0 && <span key={`out-${frame.previous}`} lang={GREETINGS[frame.previous].lang} dir="auto" className="dubbing-greeting-out absolute inset-0 flex items-center whitespace-nowrap">{GREETINGS[frame.previous].text}</span>}
      <span key={`in-${frame.current}`} lang={GREETINGS[frame.current].lang} dir="auto" className="dubbing-greeting-in absolute inset-0 flex items-center whitespace-nowrap">{GREETINGS[frame.current].text}</span>
    </span>
  </div>;
}
