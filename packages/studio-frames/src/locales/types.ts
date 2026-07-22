/** Self-contained locale keys (same shape as the app's Locale; the OSS package doesn't depend back on app i18n). */
export type SupportedLocale = 'en' | 'zh';

/**
 * Frame i18n — a separate adaptation layer (by design: not a one-to-one translation,
 * adapted per language/culture).
 *
 * Structure: one locale pack per frame (locales/en/<frameId>.ts), with
 *  - title/summary: directory and panel display name (a native English name, not pinyin);
 *  - copy: preview copy substitution table — Chinese literals in the dialect source → adapted
 *    English copy. Principle: the English should read like a native artifact of that culture
 *    (Journal = broadsheet voice, Biennale = poster slogans, Neon = terminal commands) and must
 *    fit the original layout; elements that rely on Han-character aesthetics (paper-cut couplets,
 *    mastheads) may keep the characters and translate only the functional copy.
 * Substitution runs after showcaseBlock/coverBlock builds the block (apply.ts), longest-first over
 * slots.innerHtml and label — the dialect source stays single-source Chinese, i18n lives only here.
 * zh is canonical (no pack); a new language = a new locales/<locale>/ set of packs.
 */

export interface FrameLocalePack {
  /** Theme name in this language (adapted, not literal). */
  title: string;
  /** One-line summary. */
  summary: string;
  /** Preview copy substitution table: Chinese literal in dialect source → adapted copy. Keys must match the source verbatim (pinned by tests). */
  copy: Record<string, string>;
}

/** showcase kind (canonical Chinese key) → per-language display label. */
export const KIND_LABELS_EN: Record<string, string> = {
  标题卡: 'Title card',
  金句: 'Quote',
  大数字: 'Big number',
  列表: 'List',
  对比: 'Compare',
  图表: 'Chart',
  走势: 'Trend',
  步骤: 'Steps',
  引导: 'CTA',
  数字变化: 'Count-up',
  章节: 'Chapters',
  代码: 'Code',
  评论: 'Comments',
  倒计时: 'Countdown',
  问答: 'Q&A',
  时间线: 'Timeline',
  人名条: 'Lower third',
};
