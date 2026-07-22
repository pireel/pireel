/**
 * The SINGLE exit for studio prompts.
 *
 * Organization: one prompt per .ts file (prompts change often; separate files
 * diff and revert cleanly). Variable injection = function params + native ${}
 * (compile-time safety net); concatenation = template-literal splicing
 * (see plan.ts: core section + two output contracts). Consumers always import
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

export { BLOCK_SYSTEM } from './block-system';
export { PLAN_CORE, PLAN_SYSTEM, PLAN_SYSTEM_TOOLS } from './plan';
export * from './chat';
export { THEME_GENERAL_BRIEF } from './theme-brief';
export { withActiveTheme, planWithActiveTheme } from './active-theme';
// Tool contracts (schema + English description; server attaches streamText / client executes via onToolCall)
export * from './agent-tools';
export { AROLL_GUIDE } from './aroll-guide';
// instructions + description override table for external agents (MCP)
export { MCP_INSTRUCTIONS, MCP_DESCRIPTION_OVERRIDES, PIREEL_SKILL_VERSION } from './mcp';
