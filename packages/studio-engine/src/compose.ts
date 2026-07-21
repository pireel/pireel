/**
 * Studio composer —— "agent 写 HTML 片段" 的服务端大脑。
 *
 * 只有**单块(fragment)**一条路径:给 LLM 灌片段契约(#BLOCK_ID 作用域 + 局部时间 GSAP)+
 * 设计约束 + 组件词汇/图表 recipe,按指令生成/修改一个块的 innerHtml + timelineBody。
 * 整篇 composition 由 assembleHtml(数据驱动 + 模板注册表)拼,**不再让 LLM 重写整篇**——
 * 那会破坏「块是数据」的模型(旧 HYPERFRAMES_SYSTEM 整篇路径已删,勿加回)。
 *
 * 语言策略:system prompt 一律英文(注进模型的);**画面内可见文本跟口播稿语言**(LANGUAGE 规则);
 * 面向用户的 note 跟 UI locale(调用方传 lang,缺省跟指令语言)。
 */

import { BLOCK_SYSTEM, withActiveTheme } from './prompts';

/** 最小 chat 形状(对齐 @/lib/models 的 ModelRouter.chat)。 */
interface ChatHint {
  quality?: 'high' | 'standard' | 'cheap';
  provider?: string;
  provider_model_id?: string;
}
interface ChatCapable {
  chat: (i: { system?: string; prompt: string; hint?: ChatHint }) => Promise<{ text: string }>;
}

/** 回退 hint(OpenRouter 无默认 chat model;路由会传 catalog 解析出的真 provider_model_id)。 */
const HINT: ChatHint = { quality: 'high' };
export type { ChatHint };

/** 把当前主题简报接到 system 末尾(装配在 prompts/index.ts,正文在 active-theme-compose.md)。 */
export const withTheme = withActiveTheme;

export interface ComposeContext {
  /** 口播文案全文(内容背景语境)。 */
  script?: string;
  /** 片段窗内的口播句 + **本地时间**(秒,0=片段起点):序列/叠加内容按「这句何时被说到」精确卡点。 */
  beats?: Array<{ text: string; start: number; end: number }>;
  /** 同一条视频里其它片段的一句话清单(按时间序,含本块位置标记)——反单调:让模型看见邻块,主动换原型/对齐/动效。 */
  neighbors?: string[];
}

/* ============================ 单块编辑(分镜块) ============================ */

export interface BlockEdit {
  id: string;
  kind: string;
  innerHtml: string;
  timelineBody: string;
  label?: string;
  /** 这个片段 box 的真实像素尺寸(在 1080×1920 画布内),让模型按真实画面定字号/组件大小。 */
  boxPx?: { w: number; h: number };
  /** 片段在屏时长(秒):序列类内容据此把逐条揭示摊到整段(PPT 式),不要一股脑全出。 */
  durationSec?: number;
}

export { BLOCK_SYSTEM };

export function buildBlockPrompt(args: { block: BlockEdit; instruction: string; context?: ComposeContext; lang?: string }): string {
  const parts: string[] = [`BLOCK_ID = ${args.block.id} (scope all selectors under #${args.block.id})`, `Block kind: ${args.block.kind}`];
  if (args.block.boxPx)
    parts.push(
      // 「不许超出」是硬约束:绝对定位内容溢出 box 时 autofit(scroll 尺寸)测不到,
      // 溢出的字会盖到人脸/出画——宁小勿溢,标题字号给了硬上限
      `This fragment's box is about ${args.block.boxPx.w}×${args.block.boxPx.h}px inside the FIXED 1080px-wide canvas reference (px is consistent — the whole canvas scales uniformly for preview/export). HARD CONSTRAINT: everything must fit INSIDE ${args.block.boxPx.w}×${args.block.boxPx.h}px — nothing may stick out (overflowing content lands on the speaker's face or off-canvas; there is no auto-shrink for absolutely-positioned overflow). When unsure, size type one step SMALLER, never larger. Keep the largest headline ≤ ${Math.max(40, Math.round(args.block.boxPx.h / 4))}px and total content height (with margins) within the box. Adapt the layout to this box's aspect ratio.`,
    );
  if (args.block.durationSec)
    parts.push(
      `This fragment is on screen for about ${args.block.durationSec.toFixed(1)}s. For SEQUENTIAL content (steps / numbered list / pipeline / timeline), reveal the items ONE BY ONE spread ACROSS this whole duration (PPT / presenter rhythm — advance through them over the seconds), and highlight the active item; do NOT reveal them all at time 0. For non-sequential content, one calm reveal near the start then hold still.`,
    );
  if (args.block.label) parts.push(`This block currently shows: ${args.block.label}`);
  if (args.context?.neighbors?.length)
    parts.push(
      `OTHER FRAGMENTS in this video, in order («THIS» marks the one you are making). Design for THIS fragment's content first; then, all else equal, avoid looking identical to its neighbors (vary alignment / motion flavor / secondary devices; repeating an archetype is fine when it fits best):\n${args.context.neighbors
        .map((s) => `  ${s}`)
        .join('\n')}`,
    );
  if (args.context?.script)
    parts.push(
      `Spoken script context:\n${args.context.script.slice(0, 800)}\n\nON-SCREEN TEXT LANGUAGE = the language of this spoken script (NOT the instruction's language, NOT the note's language).`,
    );
  if (args.context?.beats?.length)
    parts.push(
      `SPOKEN BEATS inside this fragment — what the speaker says and WHEN, in LOCAL seconds (0 = this fragment's start):\n${args.context.beats
        .map((x) => `  ${x.start.toFixed(1)}–${x.end.toFixed(1)}s 「${x.text}」`)
        .join('\n')}\nSYNC the reveals to these timestamps: reveal/highlight each item EXACTLY when its content is spoken (match each item to the beat that mentions it), using these local times directly as the GSAP positions — NOT an even auto-spread.`,
    );
  parts.push(`Current INNER HTML:\n\`\`\`html\n${args.block.innerHtml}\n\`\`\``);
  parts.push(`Current TIMELINE BODY:\n\`\`\`js\n${args.block.timelineBody}\n\`\`\``);
  parts.push(`Instruction: ${args.instruction}`);
  const noteLang = args.lang ? `the user's UI language "${args.lang}"` : 'the same language as the instruction above';
  parts.push(`First reply with ONE short note in ${noteLang} describing the change, THEN the updated INNER HTML (\`\`\`html), THEN the updated TIMELINE BODY (\`\`\`js).`);
  return parts.join('\n\n');
}

export function parseBlockResponse(
  text: string,
  fb: { innerHtml: string; timelineBody: string },
): { innerHtml: string; timelineBody: string; note: string } {
  const html = /```html\s*([\s\S]*?)```/i.exec(text);
  const js = /```(?:js|javascript)\s*([\s\S]*?)```/i.exec(text);
  // note = 去掉两个围栏后剩下的文字
  let note = text;
  for (const m of [html, js]) if (m) note = note.replace(m[0], '');
  note = note.trim() || '已更新该块';
  return {
    innerHtml: html?.[1]?.trim() || fb.innerHtml,
    timelineBody: js?.[1]?.trim() || fb.timelineBody,
    note,
  };
}

export async function composeBlock(
  models: ChatCapable,
  args: { block: BlockEdit; instruction: string; context?: ComposeContext; hint?: ChatHint; theme?: string; lang?: string },
): Promise<{ innerHtml: string; timelineBody: string; note: string }> {
  const r = await models.chat({ system: withTheme(BLOCK_SYSTEM, args.theme), prompt: buildBlockPrompt(args), hint: args.hint ?? HINT });
  return parseBlockResponse(r.text, { innerHtml: args.block.innerHtml, timelineBody: args.block.timelineBody });
}
