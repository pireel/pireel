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

/** Block kinds are language-NEUTRAL kebab ids (declared in frame.md `showcase:` lists and
 *  overlay/showcase set keys); display labels live here per locale. Adding a locale = adding
 *  a table — the ids themselves never change. */
export const KIND_LABELS_EN: Record<string, string> = {
  'title-card': 'Title card',
  'quote': 'Quote',
  'big-number': 'Big number',
  'list': 'List',
  'compare': 'Compare',
  'chart': 'Chart',
  'trend': 'Trend',
  'steps': 'Steps',
  'cta': 'CTA',
  'count-up': 'Count-up',
  'chapters': 'Chapters',
  'code': 'Code',
  'comments': 'Comments',
  'countdown': 'Countdown',
  'qa': 'Q&A',
  'timeline': 'Timeline',
  'lower-third': 'Lower third',
  'source-led': 'Source-led scene',
  'evidence-plane': 'Evidence plane',
  'distillation': 'Distillation page',
  'measured-sequence': 'Measured sequence',
  'quiet-comparison': 'Quiet comparison',
  'human-pause': 'Human pause',
  // overlay-element kinds (per-dialect hand-crafted sets; shown as card labels in the assets panel)
  'title-bar': 'Title bar',
  'bullet-list': 'Bullet list',
  'keyword-slam': 'Keyword slam',
  'callout': 'Callout',
  'follow-cta': 'Follow CTA',
  'comparison': 'Comparison',
};

export const KIND_LABELS_ZH: Record<string, string> = {
  'title-card': '标题卡',
  'quote': '金句',
  'big-number': '大数字',
  'list': '列表',
  'compare': '对比',
  'chart': '图表',
  'trend': '走势',
  'steps': '步骤',
  'cta': '引导',
  'count-up': '数字变化',
  'chapters': '章节',
  'code': '代码',
  'comments': '评论',
  'countdown': '倒计时',
  'qa': '问答',
  'timeline': '时间线',
  'lower-third': '人名条',
  'source-led': '源画面主导',
  'evidence-plane': '证据平面',
  'distillation': '观点留白',
  'measured-sequence': '过程轴',
  'quiet-comparison': '克制对比',
  'human-pause': '人物停顿',
  'title-bar': '标题条',
  'bullet-list': '要点列表',
  'keyword-slam': '关键词重击',
  'callout': '标注',
  'follow-cta': '关注引导',
  'comparison': '左右对比',
};
