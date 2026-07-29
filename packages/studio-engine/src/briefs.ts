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

import { type BlockEdit, type ComposeContext, type KitChoice, BLOCK_SYSTEM, buildBlockPrompt, buildKitPrompt, parseKitResponse, withTheme } from './compose';
import { type PlanInsert, type PlanSentence, type PlanVisual, buildPlanPrompt } from './plan';
import { PLAN_SYSTEM, buildKitSystem } from './prompts';
import { planWithActiveTheme } from './prompts';
import { type ThemeId, getTheme, themeForLlm } from './theme';
import { isComponentId } from '@pireel/studio-kit';

export interface FrameContent {
  title: string;
  body: string;
}

/** compose's ACTIVE THEME text (single source shared by the compose route and BYO brief):
 *  theme tokens (+ palette override) + optional frame design-language graft (frame wins on aesthetics, engineering contract unchanged). */
export function assembleComposeTheme(themeId?: string, palette?: Record<string, string>, frame?: FrameContent | null): string {
  let theme = themeForLlm(getTheme(themeId as ThemeId | undefined), palette);
  if (frame) {
    theme += `\n\n=== FRAME DESIGN LANGUAGE — "${frame.title}" ===\nWhere this frame conflicts with the generic component styling, archetypes or default taste above, THE FRAME WINS. The engineering contract (1080px-wide reference, #ID scoping, tl local time, no external libraries, chart recipes' mechanics) always holds.\n\n${frame.body}`;
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
  /** Override the routing (an agent answered {"custom": true} and needs the markup contract for a
   *  themeless project; or wants to fill props on a themed one). Default: frame ? html : kit. */
  format?: 'kit' | 'html';
  /** The component a targeted kit block currently shows, so a BYO edit keeps unmentioned props. */
  kitCurrent?: KitChoice | null;
}

/** Block-generation brief: the caller takes system+prompt, generates with its OWN model, and passes
 *  the raw output back to apply_block. Routing mirrors the in-app client: a themed project
 *  generates HTML (the theme is a prose description the model builds from); a themeless one fills
 *  a component's typed props. The returned `format` names which contract the text will follow. */
export function assembleComposeBrief(input: ComposeBriefInput): { system: string; prompt: string; format: 'kit' | 'html' } {
  const format = input.format ?? (input.frame ? 'html' : 'kit');
  if (format === 'kit') {
    return {
      format,
      system: buildKitSystem(),
      prompt: buildKitPrompt({
        block: input.block,
        instruction: input.instruction,
        ...(input.context ? { context: input.context } : {}),
        ...(input.lang ? { lang: input.lang } : {}),
        ...(input.kitCurrent ? { current: input.kitCurrent } : {}),
      }),
    };
  }
  return {
    format,
    system: withTheme(BLOCK_SYSTEM, assembleComposeTheme(input.theme, input.palette, input.frame)),
    prompt: buildBlockPrompt({
      block: input.block,
      instruction: input.instruction,
      ...(input.context ? { context: input.context } : {}),
      ...(input.lang ? { lang: input.lang } : {}),
    }),
  };
}

/* ============================ apply_block raw interpretation ============================ */

/** What a BYO agent's raw answer turned out to be. Shared by both apply_block executors (browser
 *  bridge + offline) so the three-way null semantics cannot drift between them. */
export type ApplyRawOutcome =
  | { kind: 'html' }
  | { kind: 'kit'; component: string; props: Record<string, unknown>; note: string }
  | { kind: 'kit-unknown'; component: string; note: string }
  | { kind: 'custom'; note: string }
  | { kind: 'declined'; note: string };

/** Shape-detect an apply_block payload. An html answer always carries a \`\`\`html fence and a kit
 *  answer never does, so the fence decides; fenceless text that parses as neither falls back to
 *  the html path, whose own fallbacks and lint handle it (legacy behaviour). */
export function interpretApplyRaw(raw: string): ApplyRawOutcome {
  if (/```html/i.test(raw)) return { kind: 'html' };
  const k = parseKitResponse(raw);
  if (k.choice) {
    return isComponentId(k.choice.component)
      ? { kind: 'kit', component: k.choice.component, props: k.choice.props, note: k.note }
      : { kind: 'kit-unknown', component: k.choice.component, note: k.note };
  }
  if (k.custom) return { kind: 'custom', note: k.note };
  if (k.declined) return { kind: 'declined', note: k.note };
  return { kind: 'html' };
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
