/** Shared shape of a gen-panel template entry — see ../gen-templates.ts for the library overview. */

export interface GenTemplate {
  id: string;
  /** Category (original English category / custom Chinese category for video), displayed via the TEMPLATE_CATEGORY_ZH map. */
  category: string;
  /** When a video template has no preview clip, the title fills the card; image templates rely on image, title not required. */
  title?: string;
  /** Preview image bare key (R2; image templates have it), shown via imageThumb. */
  image?: string;
  /** Finished preview clip bare key (R2; only set when a video template has a finished clip), card loops it; shown via imageThumb(_,'original'). */
  video?: string;
  /** Full prompt, dropped into the input on card click. */
  prompt: string;
}

/** Chinese category display names (fall back to the original string if missing). */
