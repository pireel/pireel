/**
 * BYO-brain brief assembly — the server half of the "brief → external model
 * generates → apply validates and commits the block" contract.
 *
 * Client-agnostic. Today's consumer is /api/studio/mcp (Codex / Claude Code /
 * any MCP client), but this does pure-function assembly only and knows nothing
 * about MCP — future internal chat, our own agent, or any other transport going
 * BYO gets briefs from here too. The LLM belongs to the caller; the quality
 * contract does not degrade: output still passes parseBlockResponse + lintBlock
 * (apply side) / parsePlan (submit side).
 *
 * Shares the same prompt pure-functions as our own LLM path (BLOCK_SYSTEM/
 * withTheme/buildBlockPrompt, PLAN_SYSTEM/planWithActiveTheme/buildPlanPrompt);
 * there is NO second prompt — the compose route's ACTIVE THEME assembly also
 * converges here (assembleComposeTheme) to prevent drift between two places.
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

/** compose's ACTIVE THEME text (single source shared by the compose route and BYO brief):
 *  theme tokens (+ palette override) + optional frame design-language graft (frame wins on aesthetics, engineering contract unchanged). */
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

/** Block-generation brief: the caller takes system+prompt, generates with its OWN model, and passes the raw output back to apply_block.
 *  The output-format contract (note → \`\`\`html → \`\`\`js) is at the end of the prompt, not a separate doc. */
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

/** Plan brief: uses the single-shot JSON contract (PLAN_SYSTEM, not our LLM's tool-loop variant);
 *  the caller generates the DraftPlan JSON and passes it raw back to submit_plan (parsePlan tolerantly reconciles it). */
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
