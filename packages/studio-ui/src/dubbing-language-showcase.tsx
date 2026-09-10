import { useEffect, useState } from 'react';
import { DUBBING_LANGUAGES, type DubbingLanguageCode } from '@pireel/studio-engine/scene-languages';
import { DUBBING_ENTRY_ICON } from './workflow-art';

const NATIVE_NAMES: Record<DubbingLanguageCode, string> = {
  en: 'English', zh: '普通话', ja: '日本語', ko: '한국어', yue: '廣東話',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', ru: 'Русский',
  it: 'Italiano', ar: 'العربية', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย',
  ms: 'Bahasa Melayu', hi: 'हिन्दी', tl: 'Filipino', tr: 'Türkçe', nl: 'Nederlands',
  uk: 'Українська', pl: 'Polski', ro: 'Română', el: 'Ελληνικά', cs: 'Čeština',
  fi: 'Suomi', bg: 'Български', da: 'Dansk', he: 'עברית', fa: 'فارسی',
  sk: 'Slovenčina', sv: 'Svenska', hr: 'Hrvatski', hu: 'Magyar', nb: 'Norsk bokmål',
  sl: 'Slovenščina', ca: 'Català', nn: 'Nynorsk', ta: 'தமிழ்', af: 'Afrikaans',
};
const ROWS = Array.from({ length: 5 }, (_, index) => DUBBING_LANGUAGES.slice(index * 8, index * 8 + 8));

export function DubbingLanguageShowcase({ locale }: { locale: 'zh' | 'en' }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const update = () => setPaused(document.visibilityState === 'hidden');
    update(); document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div role="img" aria-label={locale === 'zh' ? '支持 40 种语言的视频译制' : 'Video dubbing in 40 languages'} className="relative grid h-44 w-full place-items-center overflow-hidden">
    <div aria-hidden="true" className="dubbing-language-field pointer-events-none absolute inset-0"><div className="dubbing-language-wall absolute inset-0 flex flex-col justify-center gap-2.5">
      {ROWS.map((languages, row) => <div key={row} className="dubbing-language-row flex w-max" style={{ animationDuration: `${44 + row * 5}s`, animationDirection: row % 2 ? 'reverse' : 'normal', animationPlayState: paused ? 'paused' : 'running' }}>
        {[0, 1].map((copy) => <div key={copy} className="flex shrink-0 items-center gap-8 pr-8">
          {languages.map((language) => <span key={language.code} lang={language.code} dir="auto" className="text-ink-3 whitespace-nowrap text-[15px] font-medium leading-6 sm:text-base">{NATIVE_NAMES[language.code]}</span>)}
        </div>)}
      </div>)}
    </div>
    </div>
    <img src={DUBBING_ENTRY_ICON} alt="" width={104} height={104} className="relative size-[104px] object-contain" />
  </div>;
}
