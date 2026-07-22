/**
 * ACTIVE THEME wrapper: appends the current theme brief (themeForLlm output) to
 * the end of system. Two wordings, compose / plan; the plan one was previously
 * inlined separately in the lib single-shot path and the route tool-loop path,
 * on the edge of drifting — always go through here, no more inlining.
 * Variable injection = function params + native ${}, compile-time safety net.
 */

/** compose: presets only, select don't invent. */
export function withActiveTheme(system: string, theme?: string): string {
  if (!theme) return system;
  return `${system}

=== ACTIVE THEME (preset design system) ===
Compose strictly within this theme. Use its tokens via var(--name); do NOT invent new palettes, fonts, or backgrounds. Select and arrange within it — protect the aesthetic.

${theme}`;
}

/** plan: "the video already uses this preset; plan within its tone". */
export function planWithActiveTheme(system: string, theme?: string): string {
  if (!theme) return system;
  return `${system}

=== ACTIVE THEME (the video already uses this preset; plan within its tone) ===
${theme}`;
}
