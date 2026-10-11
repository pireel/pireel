/** The shell's UI languages. */
export type SupportedLocale = 'zh' | 'en';

/** UI language for the shell: browser language decides, zh ↔ en only. */
export const shellLocale: SupportedLocale =
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
