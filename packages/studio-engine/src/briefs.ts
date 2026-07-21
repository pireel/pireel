/**
 * BYO-brain 简报组装 —— 「brief → 外部模型生成 → apply 校验落块」契约的服务端半边。
 *
 * 定位:**客户端无关**。今天的消费方是 /api/studio/mcp(Codex/Claude Code/任何
 * MCP 客户端),但这里只做纯函数组装,不知道 MCP 的存在——将来内部 chat、自家
 * agent、别的传输面要走 BYO 同样从这里拿简报。LLM 归调用方,质量契约不降级:
 * 生成物仍过 parseBlockResponse + lintBlock(apply 侧)/ parsePlan(submit 侧)。
 *
 * 与自家 LLM 路径共用同一批提示词纯函数(BLOCK_SYSTEM/withTheme/buildBlockPrompt、
 * PLAN_SYSTEM/planWithActiveTheme/buildPlanPrompt),**没有第二份 prompt**——
 * compose 路由的 ACTIVE THEME 组装也收敛到这里(assembleComposeTheme),防两处漂移。
 */

import { type BlockEdit, type ComposeContext, BLOCK_SYSTEM, buildBlockPrompt, withTheme } from './compose';
import { type PlanInsert, type PlanSentence, type PlanVisual, buildPlanPrompt } from './plan';
import { FRAME_PLAYBOOK_PREAMBLE, PLAN_SYSTEM } from './prompts';
import { planWithActiveTheme } from './prompts';
import { type ThemeId, getTheme, themeForLlm } from './theme';

export interface FrameContent {
  title: string;
  body: string;
}

/** compose 的 ACTIVE THEME 文本(compose 路由与 BYO brief 同源单点):
 *  主题 token(+palette 覆盖)+ 可选 frame 设计语言嫁接(审美层 frame 赢,工程契约不动)。 */
export function assembleComposeTheme(themeId?: string, palette?: Record<string, string>, frame?: FrameContent | null): string {
  let theme = themeForLlm(getTheme(themeId as ThemeId | undefined), palette);
  if (frame) {
    theme += `\n\n=== FRAME DESIGN LANGUAGE — "${frame.title}" ===\nWhere this frame conflicts with the generic component styling, archetypes or default taste above, THE FRAME WINS. The engineering contract (1080px-wide reference, #ID scoping, tl local time, no external libraries, chart recipes' mechanics) always holds.\n\n${FRAME_PLAYBOOK_PREAMBLE}\n\n${frame.body}`;
  }
  return theme;
}

export interface ComposeBriefInput {
  block: BlockEdit;
  instruction: string;
  context?: ComposeContext;
  theme?: string;
  palette?: Record<string, string>;
  frame?: FrameContent | null;
  lang?: string;
}

/** 块生成简报:调用方拿 system+prompt 用**自己的模型**生成,原文回传 apply_block。
 *  输出格式契约(note → \`\`\`html → \`\`\`js)已在 prompt 末尾,不另立文档。 */
export function assembleComposeBrief(input: ComposeBriefInput): { system: string; prompt: string } {
  return {
    system: withTheme(BLOCK_SYSTEM, assembleComposeTheme(input.theme, input.palette, input.frame)),
    prompt: buildBlockPrompt({
      block: input.block,
      instruction: input.instruction,
      ...(input.context ? { context: input.context } : {}),
      ...(input.lang ? { lang: input.lang } : {}),
    }),
  };
}

export interface PlanBriefInput {
  sentences: PlanSentence[];
  videoDurationSec?: number;
  theme?: string;
  visuals?: PlanVisual[];
  inserts?: PlanInsert[];
}

/** 规划简报:走单发 JSON 契约(PLAN_SYSTEM,非自家 LLM 的工具环变体)——
 *  调用方生成 DraftPlan JSON 原文回传 submit_plan(parsePlan 容错收编)。 */
export function assemblePlanBrief(input: PlanBriefInput): { system: string; prompt: string } {
  const theme = themeForLlm(getTheme(input.theme as ThemeId | undefined));
  return {
    system: planWithActiveTheme(PLAN_SYSTEM, theme),
    prompt: buildPlanPrompt({
      sentences: input.sentences,
      videoDurationSec: input.videoDurationSec ?? input.sentences.at(-1)?.end ?? 0,
      ...(input.visuals?.length ? { visuals: input.visuals } : {}),
      ...(input.inserts?.length ? { inserts: input.inserts } : {}),
    }),
  };
}
