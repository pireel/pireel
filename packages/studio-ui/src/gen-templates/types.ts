/** Shared shape of a gen-panel template entry — see ../gen-templates.ts for the library overview. */

export interface GenTemplate {
  id: string;
  /** Category (original English category / custom Chinese category for video), displayed via the TEMPLATE_CATEGORY_ZH map. */
  category: string;
  /** Title for text-only video/component/audio cards; image templates usually rely on their preview. */
  title?: string;
  /** Preview image bare key (R2; image templates have it), shown via imageThumb. */
  image?: string;
  /** Finished preview clip bare key (R2; only set when a video template has a finished clip), card loops it; shown via imageThumb(_,'original'). */
  video?: string;
  /** Finished bundled overlay component used for a live template preview. */
  presetId?: string;
  /** Default full prompt (English), dropped into the input on card click and used as the fallback for unsupported locales. */
  prompt: string;
  /** Locale-specific prompt overrides. Keys may be full locales (zh-CN) or base languages (zh). */
  promptI18n?: Record<string, string>;
}

/** Pick the most specific localized prompt available, then the base language, then English fallback. */
export function localizedTemplatePrompt(template: GenTemplate, locale: string): string {
  const normalized = locale.toLowerCase();
  const base = normalized.split('-')[0] ?? normalized;
  return template.promptI18n?.[normalized] ?? template.promptI18n?.[base] ?? template.prompt;
}

/** Chinese category display names (fall back to the original string if missing). */
