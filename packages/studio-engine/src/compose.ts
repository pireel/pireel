/**
 * Studio composer — the server-side brain for "agent writes HTML fragments".
 *
 * There is only one path — single block (fragment): feed the LLM the fragment
 * contract (#BLOCK_ID scope + local-time GSAP) + design constraints + component
 * vocabulary/chart recipes, and per instruction generate/modify one block's
 * innerHtml + timelineBody. The whole composition is stitched by assembleHtml
 * (data-driven + template registry) — the LLM never rewrites the whole thing,
 * which would break the "blocks are data" model (the old whole-composition
 * HYPERFRAMES_SYSTEM path is deleted; don't add it back).
 *
 * Language policy: system prompt is always English (what's injected into the
 * model); on-screen text follows the spoken script's language (LANGUAGE rule);
 * the user-facing note follows the UI locale (caller passes lang, defaults to
 * the instruction's language).
 */

import { BLOCK_SYSTEM, withActiveTheme } from './prompts';

/** Minimal chat shape (matches @/lib/models ModelRouter.chat). */
interface ChatHint {
  quality?: 'high' | 'standard' | 'cheap';
  provider?: string;
  provider_model_id?: string;
}
interface ChatCapable {
  chat: (i: { system?: string; prompt: string; hint?: ChatHint }) => Promise<{ text: string }>;
}

/** Fallback hint (OpenRouter has no default chat model; the router passes the real provider_model_id resolved from the catalog). */
const HINT: ChatHint = { quality: 'high' };
export type { ChatHint };

/** Append the current theme brief to the end of system (assembled in prompts/index.ts, body in active-theme-compose.md). */
export const withTheme = withActiveTheme;

export interface ComposeContext {
  /** Full spoken script (content background context). */
  script?: string;
  /** Spoken beats within the fragment window + local time (seconds, 0 = fragment start): sequence/overlay content is cued precisely by when each line is spoken. */
  beats?: Array<{ text: string; start: number; end: number }>;
  /** One-line list of the other fragments in this same video (time order, marks this block's position) — anti-monotony: let the model see neighbors and vary archetype/alignment/motion. */
  neighbors?: string[];
}

/* ============================ Single-block edit (shot block) ============================ */

export interface BlockEdit {
  id: string;
  kind: string;
  innerHtml: string;
  timelineBody: string;
  label?: string;
  /** This fragment box's real pixel size (inside the 1080×1920 canvas), so the model sizes type/components against the actual frame. */
  boxPx?: { w: number; h: number };
  /** On-screen duration (seconds): sequential content spreads its reveals across the whole span (PPT-style) instead of dumping all at once. */
  durationSec?: number;
}

export { BLOCK_SYSTEM };

export function buildBlockPrompt(args: { block: BlockEdit; instruction: string; context?: ComposeContext; lang?: string }): string {
  const parts: string[] = [`BLOCK_ID = ${args.block.id} (scope all selectors under #${args.block.id})`, `Block kind: ${args.block.kind}`];
  if (args.block.boxPx)
    parts.push(
      // "must not overflow" is a hard constraint: autofit (scroll size) can't detect overflow of absolutely-positioned content,
      // and overflowing text lands on the face / off-canvas — prefer too small over overflow; headline gets a hard cap
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
  // note = the text left after removing both fenced blocks
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
