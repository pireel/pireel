/** 包自持的 locale 键(与 app 的 Locale 结构一致,开源包不反向依赖 app i18n)。 */
export type SupportedLocale = 'en' | 'zh';

/**
 * frame 国际化 —— **单独一份的适配层**(用户定的:不做一比一翻译,按语言/文化特性适配)。
 *
 * 结构:每个 frame 一个 locale 包(locales/en/<frameId>.ts),含
 *  - title/summary:目录与面板显示名(英文语境下的名字,不是拼音直译);
 *  - copy:预览文案替换表 —— 方言块源码里的中文字面量 → 适配后的英文文案。
 *    适配原则:英文版要像"那个文化里原生的东西"(报刊=英文大报语感、双年展=英文海报口号、
 *    霓虹=终端指令),长度要塞得进原版式;涉及汉字美学的元素(剪纸对联/报头)可保留汉字,
 *    只翻功能性文案。
 * 替换发生在 showcaseBlock/coverBlock 构块之后(apply.ts),对 slots.innerHtml 与 label
 * 做最长优先的字面量替换 —— 方言源码保持中文单一来源,i18n 永远独立在这一层。
 * zh 是 canonical(无包);新增语言 = 新建 locales/<locale>/ 一套包。
 */

export interface FrameLocalePack {
  /** 该语言下的主题名(适配,非直译)。 */
  title: string;
  /** 一句话简介。 */
  summary: string;
  /** 预览文案替换表:方言源码中文字面量 → 适配文案。键必须与源码逐字一致(有测试钉)。 */
  copy: Record<string, string>;
}

/** showcase 词(canonical 中文键)→ 各语言显示标签。 */
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
