/**
 * 主题(Theme)—— 预设设计系统,一等概念。
 *
 * 关键模型(2026-06 校准):**主题 = 结构,颜色 = 派生**。
 *  - 主题固定的是「结构性」的东西:版式网格、字阶对比、间距、发丝线、克制原则、组件词汇、动效。
 *  - 颜色只给**中性默认**,真正的 accent / 面板色温由「前置画面分析的底色」派生覆盖(themeForLlm 接 palette,
 *    assembleHtml 把派生 vars 叠在默认 vars 之后)。这样「通用」才成立:结构通用,颜色随片自适应。
 *
 * 学归藏/Anthropic pptx 的铁律:**预设 only,agent 只选不造**(保护美感)。主题两面:
 *  1) brief —— 给 LLM 的**结构设计简报 + 约束**(英文 md),compose/plan 注进 system。
 *  2) vars/background —— 一组可直接切的 CSS 变量(中性默认),注到 #root;派生 palette 覆盖其中颜色项。
 */

import { THEME_GENERAL_BRIEF } from './prompts';

export type ThemeId = 'general';

export interface Theme {
  id: ThemeId;
  name: string;
  /** #root 背景(默认中性;派生 palette 不动它)。 */
  background: string;
  /** CSS 自定义属性(键不含 --),模板/生成 HTML 用 var(--key)。颜色项可被派生 palette 覆盖。 */
  vars: Record<string, string>;
  /** 自动分镜是否铺口播花字/字幕(逐句动效字)。结构性取舍,由主题定;general 默认不铺(只出设计图形)。 */
  captions: boolean;
  /** 给 LLM 的结构设计简报(英文 md):结构/版式/字体/动效/禁忌。token 表由 themeForLlm 自动追加。 */
  brief: string;
}

// 设计字体(预览经 Google Fonts 切片加载,见 assembleHtml 的 FONT_LINKS;CJK 动态文本靠 unicode-range 分片,
// 不预子集)。导出端需把用到的字形子集化/内联 + await document.fonts.ready 再抓帧(CLI 对齐点)。
const SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,"SF Mono","Roboto Mono",Menlo,monospace';

/**
 * 通用(默认)—— 结构化「编辑/数据」设计系统。中性纸墨默认色,accent/面板色温由画面底色派生。
 * 目标:产出**有设计感的版式化片段**(卡片/图表/流程图/结构图/对比/KPI),不是字幕。
 */
export const GENERAL_THEME: Theme = {
  id: 'general',
  name: '通用',
  background: '#f5f3ee',
  captions: false, // 通用默认不铺花字/字幕,只出设计图形(片段≠字幕)
  vars: {
    // —— 中性默认色(派生 palette 会覆盖 accent / accent-2 / panel / line / grid)——
    paper: '#f5f3ee',
    fg: '#16140f', // 主墨色
    muted: 'rgba(22,20,15,0.56)', // 次要文字/标签
    accent: '#d8472f', // 单一强调色(派生覆盖)
    'accent-2': '#1f5fd0', // 次强调,极少用(派生覆盖)
    panel: '#ffffff', // 卡片底(派生轻微染色温)
    'panel-2': '#ece8df', // 次面板/底纹
    line: 'rgba(22,20,15,0.16)', // 发丝线(派生染色温)
    grid: 'rgba(22,20,15,0.07)', // 网格/坐标线
    up: '#1f8f4e', // 图表正向
    down: '#d8472f', // 图表负向
    'font-head': SANS,
    'font-body': SANS,
    'font-num': MONO,
    radius: '14px',
    shadow: '0 10px 34px rgba(20,18,12,0.14)',
  },
  brief: THEME_GENERAL_BRIEF,
};

export const THEMES: Record<ThemeId, Theme> = { general: GENERAL_THEME };

export function getTheme(id: ThemeId | undefined): Theme {
  return (id && THEMES[id]) || GENERAL_THEME;
}

/** 6 位 hex → 带 alpha 的 8 位 hex(#rgb 先展开);非 hex(rgba/关键字)原样返回。 */
function withAlpha(color: string, alphaHex: string): string {
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(color.trim());
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}${alphaHex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(color.trim())) return `${color.trim()}${alphaHex}`;
  return color;
}

/** 主题变量(+可选派生覆盖)→ 注到 #root 的声明串。派生在后,覆盖默认。
 *  卡面色(panel/panel-2)统一垫 90% 透明度:组件叠在视频上,纯不透明卡面把画面糊死
 *  (用户定的:所有主题的背景色默认带透明度)。paper 不动——它既是画布底色,
 *  又被部分方言当反白文字色(color:var(--paper))用,加 alpha 会把字弄虚。 */
export function themeVarsCss(theme: Theme, palette?: Record<string, string>): string {
  const all = { ...theme.vars, ...(palette ?? {}) };
  for (const k of ['panel', 'panel-2']) {
    if (all[k]) all[k] = withAlpha(all[k], 'e6');
  }
  return Object.entries(all)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
}

/** 主题 → 给 LLM 的完整简报:brief(结构约束)+ 自动拼的 token 表(单一来源 vars + 派生覆盖,不漂移)。
 *  注进 compose/plan 的 system,作为"预设 only、只选不造"的载体。派生 palette 让 LLM 看到真实 accent。 */
export function themeForLlm(theme: Theme, palette?: Record<string, string>): string {
  const all = { ...theme.vars, ...(palette ?? {}) };
  const tokens = Object.entries(all)
    .map(([k, v]) => `--${k}: ${v};`)
    .join('\n');
  return `${theme.brief}

## Design tokens (use via var(--name); colors are DERIVED FROM THE FOOTAGE — do NOT invent other colors or fonts)
${tokens}
root background: ${theme.background}`;
}
