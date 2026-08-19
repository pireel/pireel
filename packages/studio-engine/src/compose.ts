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

import { BLOCK_SYSTEM, buildHtmlSystem, retrieveComponentCandidates, retrieveMotionGraphicPatterns, withActiveTheme } from './prompts';

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
  /** Whole-film design system and current Semantic Scene treatment resolved from the saved plan. */
  designDirection?: string;
  /** What the generated layer sits over and which subjects/zones must remain unobstructed. */
  backdrop?: string;
}

/* ============================ Single-block edit (shot block) ============================ */

export interface BlockEdit {
  id: string;
  kind: string;
  innerHtml: string;
  timelineBody: string;
  label?: string;
  /** This fragment box's real pixel size inside the current canvas, so the model sizes type/components against the actual frame. */
  boxPx?: { w: number; h: number };
  /** On-screen duration (seconds): sequential content spreads its reveals across the whole span (PPT-style) instead of dumping all at once. */
  durationSec?: number;
}

export { BLOCK_SYSTEM };

/** Everything both paths say about the moment being designed — the box, the clock, the speech,
 *  the neighbours. Only the head (who you are talking to) and the tail (what to return) differ,
 *  so this stays one function: context drift between the HTML and kit paths would make their
 *  outputs incomparable, and comparing them is the whole point of running both. */
function momentParts(args: { block: BlockEdit; context?: ComposeContext }): string[] {
  const parts: string[] = [];
  if (args.context?.designDirection) parts.push(args.context.designDirection);
  if (args.context?.backdrop) parts.push(`BACKDROP AND PROTECTED ZONES:\n${args.context.backdrop}`);
  if (args.block.durationSec)
    parts.push(
      `This fragment is on screen for about ${args.block.durationSec.toFixed(1)}s. When timed SPOKEN BEATS are supplied below, they own reveal timing. Otherwise, for SEQUENTIAL content (steps / numbered list / pipeline / timeline), reveal the items ONE BY ONE spread ACROSS this whole duration (PPT / presenter rhythm — advance through them over the seconds), and highlight the active item; do NOT reveal them all at time 0. Genuinely single-beat content gets one calm reveal near the start then holds still.`,
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
        .join('\n')}\nSYNC the reveals to these timestamps: map EVERY independently spoken content item to the beat that first mentions it; keep later content hidden until that beat, then reveal/highlight it EXACTLY at the listed local time. Use these local times directly as GSAP positions — NOT an even auto-spread and NEVER the complete final state at time 0.`,
    );
  return parts;
}

export function buildBlockPrompt(args: { block: BlockEdit; instruction: string; context?: ComposeContext; lang?: string }): string {
  const parts: string[] = [`BLOCK_ID = ${args.block.id} (scope all selectors under #${args.block.id})`, `Block kind: ${args.block.kind}`];
  if (args.block.boxPx)
    parts.push(
      // "must not overflow" is a hard constraint: autofit (scroll size) can't detect overflow of absolutely-positioned content,
      // and overflowing text obscures protected content or falls off-canvas — prefer too small over overflow; headline gets a hard cap
      `This fragment's real authored box is ${args.block.boxPx.w}×${args.block.boxPx.h}px in the current canvas coordinate system (the full composition scales uniformly for preview/export). HARD CONSTRAINT: everything must fit INSIDE ${args.block.boxPx.w}×${args.block.boxPx.h}px — nothing may obscure a protected subject/evidence region or fall off-canvas; there is no auto-shrink for absolutely-positioned overflow. When unsure, size type one step SMALLER, never larger. Keep the largest headline ≤ ${Math.max(40, Math.round(args.block.boxPx.h / 4))}px and total content height (with margins) within the box. Adapt the layout to this box's aspect ratio.`,
    );
  parts.push(...momentParts(args));
  parts.push(`Current INNER HTML:\n\`\`\`html\n${args.block.innerHtml}\n\`\`\``);
  parts.push(`Current TIMELINE BODY:\n\`\`\`js\n${args.block.timelineBody}\n\`\`\``);
  parts.push(`Instruction: ${args.instruction}`);
  parts.push(`MANDATORY FINAL CSS AUDIT for this exact response: inspect EVERY selector in the <style>, including selectors after commas and selectors inside @container. Every one must start with #${args.block.id}. Rewrite any shorthand such as ".kicker", ".pf .logo", or ".rule" to "#${args.block.id} .kicker", "#${args.block.id} .pf .logo", and "#${args.block.id} .rule" before answering. One unscoped selector makes the component invalid.`);
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
  note = note.trim() || 'Updated the block';
  return {
    innerHtml: html?.[1]?.trim() || fb.innerHtml,
    timelineBody: js?.[1]?.trim() || fb.timelineBody,
    note,
  };
}

/* ============================ Kit path (component + props) ============================ */

/** What the kit path returns: a component choice, or nothing when the moment deserves no graphic. */
export interface KitChoice {
  component: string;
  props: Record<string, unknown>;
}

export function buildKitPrompt(args: {
  block: BlockEdit;
  instruction: string;
  context?: ComposeContext;
  lang?: string;
  /** The component this block already shows, when editing rather than creating. */
  current?: KitChoice | null;
}): string {
  const parts: string[] = [];
  if (args.block.boxPx)
    // No overflow warning here: the component computes every size from this box, so the model
    // cannot overflow it. The box is stated because it decides which staging reads well.
    parts.push(
      `The box for this graphic is ${args.block.boxPx.w}×${args.block.boxPx.h}px (${args.block.boxPx.w >= args.block.boxPx.h * 1.2 ? 'wide' : args.block.boxPx.h >= args.block.boxPx.w * 1.2 ? 'tall' : 'roughly square'}). Sizes are computed for you — pick the staging that suits this shape.`,
    );
  parts.push(...momentParts(args));
  if (args.current)
    parts.push(`This graphic currently is:\n\`\`\`json\n${JSON.stringify(args.current, null, 2)}\n\`\`\`\nKeep everything the instruction does not mention.`);
  parts.push(`Instruction: ${args.instruction}`);
  const noteLang = args.lang ? `the user's UI language "${args.lang}"` : 'the same language as the instruction above';
  parts.push(`Reply with ONE short note in ${noteLang}, then one \`\`\`json fence holding {"component":…,"props":{…}} — or null.`);
  return parts.join('\n\n');
}

/** Read the model's answer. `choice: null` covers three situations that must NOT be conflated:
 *  `declined` — the model deliberately answered null: the moment deserves no graphic at all;
 *  `custom`  — the moment deserves one but no component carries it (content-driven, or the user
 *              described something no schema fits): route to the free-form designer;
 *  neither   — the output failed to parse: a hiccup, not an opinion — regenerate.
 *  Folding these together turned "needs a bespoke build" into a deleted slot. */
export function parseKitResponse(text: string): { choice: KitChoice | null; note: string; declined: boolean; custom: boolean } {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const note = (fence ? text.replace(fence[0], '') : text).trim() || 'Chose a component';
  const raw = fence?.[1]?.trim() ?? text.trim();
  const none = { choice: null, note, declined: false, custom: false };
  if (/^null$/i.test(raw)) return { ...none, declined: true };
  if (!raw) return none;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return none;
  }
  if (typeof parsed !== 'object' || parsed === null) return none;
  const o = parsed as Record<string, unknown>;
  if (o.custom === true) return { ...none, custom: true };
  if (typeof o.component !== 'string' || !o.component) return none;
  // Props are NOT validated here — the component's own schema is the gate, and it never throws.
  // Validating twice would only add a second, weaker opinion about what is acceptable.
  const props = typeof o.props === 'object' && o.props !== null ? (o.props as Record<string, unknown>) : {};
  return { choice: { component: o.component, props }, note, declined: false, custom: false };
}

export async function composeBlock(
  models: ChatCapable,
  args: { block: BlockEdit; instruction: string; context?: ComposeContext; hint?: ChatHint; theme?: string; lang?: string; presetId?: string },
): Promise<{ innerHtml: string; timelineBody: string; note: string }> {
  const candidateComponents = retrieveComponentCandidates({
    instruction: args.instruction,
    block: args.block,
    ...(args.context ? { context: args.context } : {}),
    ...(args.presetId ? { presetId: args.presetId } : {}),
  });
  const candidatePatterns = retrieveMotionGraphicPatterns({
    instruction: args.instruction,
    block: args.block,
    ...(args.context ? { context: args.context } : {}),
  });
  const system = buildHtmlSystem({
    componentIds: candidateComponents,
    patternIds: candidatePatterns,
    ...(args.presetId ? { presetId: args.presetId } : {}),
  });
  const r = await models.chat({ system: withTheme(system, args.theme), prompt: buildBlockPrompt(args), hint: args.hint ?? HINT });
  return parseBlockResponse(r.text, { innerHtml: args.block.innerHtml, timelineBody: args.block.timelineBody });
}
