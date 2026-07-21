import type { SupportedLocale } from '@pireel/studio-frames/locales';

/** UI language for the shell: browser language decides, zh ↔ en only. */
export const shellLocale: SupportedLocale =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
