/**
 * BYO-brain brief assembly — the server half of the "brief → external model
 * generates → apply validates and commits the block" contract.
 *
 * Client-agnostic. Today's consumer is /api/studio/mcp (Codex / Claude Code /
 * any MCP client), but this does pure-function assembly only and knows nothing
 * about MCP — future internal chat, our own agent, or any other transport going
 * BYO gets briefs from here too. The LLM belongs to the caller; the quality
 * contract does not degrade: output still passes parseBlockResponse + lintBlock.
 *
 * Shares the same prompt pure-functions as our own LLM path (BLOCK_SYSTEM/
 * withTheme/buildBlockPrompt);
 * there is NO second prompt — the compose route's ACTIVE THEME assembly also
 * converges here (assembleComposeTheme) to prevent drift between two places.
 */

import { type BlockEdit, type ComposeContext, type KitChoice, buildBlockPrompt, buildKitPrompt, parseKitResponse, withTheme } from './compose';
import { buildHtmlSystem, buildKitSystem, retrieveComponentCandidates, retrieveMotionGraphicPatterns } from './prompts';
import { type ThemeId, getTheme, themeForLlm } from './theme';
import { isComponentId } from '@pireel/studio-kit';

/** compose's ACTIVE THEME text (single source shared by the compose route and BYO brief): theme tokens
 *  (+ palette override) + the creator's brand graphics when they have a brand (the brand wins on aesthetics,
 *  the engineering contract is unchanged). */
export function assembleComposeTheme(
  themeId?: string,
  palette?: Record<string, string>,
  brandGraphics?: string | null,
  visualBaseline?: string,
): string {
  let theme = themeForLlm(getTheme(themeId as ThemeId | undefined), palette);
  const baseline = visualBaseline?.trim();
  const graphics = brandGraphics?.trim();
  if (baseline) {
    theme += `\n\n=== HOST VISUAL CRAFT BASELINE ===\nThis is a neutral quality floor, not a visual identity. Apply its craft when the creator has no brand graphics. When brand graphics follow, keep the quality checks but let the brand win every visible aesthetic decision.\n\n${baseline}`;
  }
  if (graphics) {
    theme += `\n\n=== CREATOR BRAND GRAPHICS ===\nThe user's enabled MG configuration: its theme and feature-specific instructions. Where it conflicts with generic Motion Graphic styling, archetypes or default taste above, THE BRAND WINS; honor its configured colours and type, and adapt content to the current video. The Component engineering contract (sizes in the real box/canvas px given in the request, local CSS selectors, tl local time, no external libraries, chart recipes' mechanics) always holds.\n\n${graphics}`;
  }
  return theme;
}


export interface ComposeBriefInput {
  block: BlockEdit;
  instruction: string;
  context?: ComposeContext;
  theme?: string;
  palette?: Record<string, string>;
  /** The creator's brand graphics prose, when they have a brand. */
  brandGraphics?: string | null;
  /** Optional private host context that raises the quality floor without becoming a visual identity. */
  visualBaseline?: string;
  lang?: string;
  /** Domain preset constrains the searchable Component vocabulary before query-time retrieval. */
  presetId?: string;
  /** Override the routing (an agent answered {"custom": true} and needs the markup contract for a
   *  project; or wants to fill props on an existing kit block). Default: existing kit → kit,
   *  otherwise html. New generation stays bespoke even without brand graphics. */
  format?: 'kit' | 'html';
  /** The registered Component a targeted kit block currently shows, so a BYO edit keeps unmentioned props. */
  kitCurrent?: KitChoice | null;
}

/** Block-generation brief: the caller takes system+prompt, generates with its OWN model, and passes
 *  the raw output back to apply_component. Routing mirrors the in-app client: a themed project
 *  generates HTML (the optional brand graphics are a prose description the model builds from). Existing kit
 *  blocks keep their typed-props contract; new generation stays bespoke even without brand graphics. The
 *  returned `format` names which contract the text will follow. */
export function assembleComposeBrief(input: ComposeBriefInput): {
  system: string;
  prompt: string;
  format: 'kit' | 'html';
  candidateComponents: string[];
  candidatePatterns: string[];
} {
  const format = input.format ?? (input.kitCurrent ? 'kit' : 'html');
  const candidateComponents = retrieveComponentCandidates({
    instruction: input.instruction,
    block: input.block,
    ...(input.context ? { context: input.context } : {}),
    ...(input.kitCurrent ? { current: input.kitCurrent } : {}),
    ...(input.presetId ? { presetId: input.presetId } : {}),
  });
  const candidatePatterns = retrieveMotionGraphicPatterns({
    instruction: input.instruction,
    block: input.block,
    ...(input.context ? { context: input.context } : {}),
  });
  if (format === 'kit') {
    return {
      format,
      candidateComponents,
      candidatePatterns,
      system: buildKitSystem({ componentIds: candidateComponents, ...(input.presetId ? { presetId: input.presetId } : {}) }),
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
    candidateComponents,
    candidatePatterns,
    system: withTheme(
      buildHtmlSystem({
        componentIds: candidateComponents,
        patternIds: candidatePatterns,
        ...(input.presetId ? { presetId: input.presetId } : {}),
      }),
      assembleComposeTheme(input.theme, input.palette, input.brandGraphics, input.visualBaseline),
    ),
    prompt: buildBlockPrompt({
      block: input.block,
      instruction: input.instruction,
      ...(input.context ? { context: input.context } : {}),
      ...(input.lang ? { lang: input.lang } : {}),
    }),
  };
}

/* ============================ apply_component raw interpretation ============================ */

/** What a BYO agent's raw answer turned out to be. Shared by both apply_component executors (browser
 *  bridge + offline) so the three-way null semantics cannot drift between them. */
export type ApplyRawOutcome =
  | { kind: 'html' }
  | { kind: 'kit'; component: string; props: Record<string, unknown>; note: string }
  | { kind: 'kit-unknown'; component: string; note: string }
  | { kind: 'custom'; note: string }
  | { kind: 'declined'; note: string };

/** Shape-detect an apply_component payload. An html answer always carries a \`\`\`html fence and a kit
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
