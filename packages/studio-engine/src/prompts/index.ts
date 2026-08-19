/**
 * The SINGLE exit for studio prompts.
 *
 * Organization: one prompt per .ts file (prompts change often; separate files
 * diff and revert cleanly). Variable injection = function params + native ${}
 * (compile-time safety net); concatenation = template-literal splicing
 * Consumers always import
 * from here, never poke sibling files directly.
 *
 * How to extend:
 *  - Static prompt: create xxx.ts exporting a const → re-export here.
 *  - Prompt with variables: export a function whose params are the variables
 *    (typos blow up at compile time, no template engine needed).
 *  - Large request-time dynamic content (narration script / composition snapshot)
 *    does NOT go in this directory — that's buildXxxPrompt's job; baking it into
 *    a static section would poison the prompt cache prefix.
 *
 * Discipline: body is always English (system-prompt rule); ``` fences in the body
 * must be escaped as \`\`\`; when changing block-system, run the compose.test
 * quality contract first and have the user run the STUDIO_EVAL benchmark.
 */

// Layered assembly (see assemble.ts for the stack and why the order is what it is)
export { BLOCK_SYSTEM, buildHtmlSystem, buildKitSystem } from './assemble';
export { FRAGMENT_CONTRACT } from './fragment-contract';
export { EDITOR_MODEL, IDENTITY_DISCIPLINE, ON_SCREEN_LANGUAGE, contentIsNotCommand, stateDiscipline } from './l0-editor';
export { L1_PROPS_SPEC } from './l1-props-spec';
export { catalogSection } from './l4-catalog';
export { MAX_COMPONENT_CANDIDATES, retrieveComponentCandidates } from './component-retrieval';
export {
  MAX_MOTION_GRAPHIC_PATTERNS,
  MOTION_GRAPHIC_CAPABILITY_MAP,
  MOTION_GRAPHIC_PATTERNS,
  motionGraphicPatternSection,
  retrieveMotionGraphicPatterns,
} from './motion-graphic-patterns';
export {
  type Preset,
  DEFAULT_PRESET_ID,
  GENERAL_EDITORIAL,
  GENERAL_PRESET,
  SPOKEN_EDITORIAL,
  SPOKEN_PRESET,
  getPreset,
  listPresets,
} from './presets';
export { VIDEO_DESIGN_METHOD } from './video-design-method';
export * from './chat';
export { THEME_GENERAL_BRIEF } from './theme-brief';
export { withActiveTheme } from './active-theme';
// Tool contracts (schema + English description; server attaches streamText / client executes via onToolCall)
export * from './l0-agent-tools';
// instructions + description override table for external agents (MCP)
export { mcpInstructions, MCP_DESCRIPTION_OVERRIDES } from './mcp';
