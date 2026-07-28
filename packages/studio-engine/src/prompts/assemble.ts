/**
 * The one place a system prompt is assembled, and the one place layer ORDER is decided.
 *
 * Order is stable → volatile, because the whole prefix up to the first change is what a provider
 * can cache:
 *
 *   fragment contract     never changes (this stack's base; the editor's own is on the agent side)
 *   L1 props grammar      never changes
 *   L4 vocabulary         changes when the preset changes
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
import { catalogSection } from './l4-catalog';
import { frameBlueprints } from '../blueprint-registry';
import { getPreset } from './presets';
import { withStyleDirection } from './style-direction';

/** Path-specific output contract — the only part of the stack that knows what the answer looks like. */
const KIT_OUTPUT = `OUTPUT
After the note line, ONE \`\`\`json fence:
{"component": "<id>", "staging": "<id>"?, "props": { … }}   — or  null  when this moment deserves
no graphic. Only keys listed for that component; anything else is dropped.`;

const HTML_OUTPUT = `OUTPUT
After the note line, in THIS order:
- one \`\`\`html block = the full INNER HTML,
- then one \`\`\`js block = the full TIMELINE BODY.`;

/** The component path's system prompt. */
export function buildKitSystem(opts?: { presetId?: string; voice?: string; frameId?: string }): string {
  const preset = getPreset(opts?.presetId);
  const stagings = frameBlueprints(opts?.frameId);
  const system = [FRAGMENT_CONTRACT, L1_PROPS_SPEC, catalogSection(preset.components, stagings), preset.editorial, KIT_OUTPUT].join('\n\n');
  return withStyleDirection(system, opts?.voice);
}

/** The free-form path's system prompt. Same base contract and L3.1 as the component path — only
 *  the capability layer and the output contract differ, which is the whole claim of the stack. */
export function buildHtmlSystem(opts?: { presetId?: string }): string {
  const preset = getPreset(opts?.presetId);
  return [FRAGMENT_CONTRACT, BLOCK_HTML_BODY, preset.editorial, HTML_OUTPUT].join('\n\n');
}

/** The default free-form system (spoken preset) — the theme brief is appended by withActiveTheme,
 *  which is that path's L3.2: it carries the token table, because this path writes CSS. */
export const BLOCK_SYSTEM = buildHtmlSystem();
