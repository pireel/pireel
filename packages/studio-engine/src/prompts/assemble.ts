/**
 * The one place a system prompt is assembled, and the one place layer ORDER is decided.
 *
 * Order is stable → volatile, because the whole prefix up to the first change is what a provider
 * can cache:
 *
 *   fragment contract     never changes (this stack's base; the editor's own is on the agent side)
 *   L1 props grammar      never changes
 *   L4 vocabulary         changes with the retrieved component candidates (bounded)
 *   L3.1 editorial        changes when the preset changes
 *   output contract       changes with the generation path
 *   L3.2 theme voice      changes whenever the user switches themes  ← last, on purpose
 *
 * Request-time context (the box, the beats, the neighbours, the script) is NOT a layer and never
 * appears here: it goes in the user message, or it poisons the cached prefix on every call.
 */

import { BLOCK_HTML_BODY } from './block-system';
import { FRAGMENT_CONTRACT } from './fragment-contract';
import { L1_PROPS_SPEC } from './l1-props-spec';
import { catalogSection, componentNormsSection } from './l4-catalog';
import { getPreset } from './presets';

interface ComponentSystemOptions {
  presetId?: string;
  /** Retrieved query-time subset. Omit only for catalog inspection/tests; production generation
   * should always pass the candidates selected for the current editing moment. */
  componentIds?: string[];
}

function componentIdsFor(options?: ComponentSystemOptions): string[] {
  return options?.componentIds ?? getPreset(options?.presetId).components;
}

/** Path-specific output contract — the only part of the stack that knows what the answer looks like. */
const KIT_OUTPUT = `OUTPUT
After the note line, ONE \`\`\`json fence, holding exactly one of:
{"component": "<id>", "props": { … }}   — a component carries this moment. Only keys listed for
                                          that component; anything else is dropped.
{"custom": true}                        — the moment DESERVES a graphic but no component carries it
                                          (a diagram, a bespoke layout, something the user described
                                          that fits no schema). A free-form designer takes over.
null                                    — the moment deserves NO graphic at all.
Prefer a component whenever one fits; custom is an escape, not a style choice.`;

const HTML_OUTPUT = `OUTPUT
After the note line, in THIS order:
- one \`\`\`html block = the full INNER HTML,
- then one \`\`\`js block = the full TIMELINE BODY.`;

/** The component path's system prompt. It is reserved for an explicit library-component choice or
 *  editing an existing kit block; new generation uses the free-form path even without a Frame.
 *  Components themselves stay unthemed. */
export function buildKitSystem(opts?: ComponentSystemOptions): string {
  const preset = getPreset(opts?.presetId);
  return [FRAGMENT_CONTRACT, L1_PROPS_SPEC, catalogSection(componentIdsFor(opts)), preset.editorial, KIT_OUTPUT].join('\n\n');
}

/** The free-form path's system prompt. Same base contract and L3.1 as the component path — only
 *  the capability layer and the output contract differ, which is the whole claim of the stack. */
export function buildHtmlSystem(opts?: ComponentSystemOptions): string {
  const preset = getPreset(opts?.presetId);
  // The house component types ride in DERIVED — the themed path and the component path speak the
  // same vocabulary from the same schemas (a theme restyles these types, it doesn't rename them).
  return [FRAGMENT_CONTRACT, BLOCK_HTML_BODY, componentNormsSection(componentIdsFor(opts)), preset.editorial, HTML_OUTPUT].join('\n\n');
}

/** The default free-form system (spoken preset) — the theme brief is appended by withActiveTheme,
 *  which is that path's L3.2: it carries the token table, because this path writes CSS. */
export const BLOCK_SYSTEM = buildHtmlSystem({ componentIds: [] });
