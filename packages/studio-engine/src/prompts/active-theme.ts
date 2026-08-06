/**
 * ACTIVE THEME wrapper: appends the current theme brief (themeForLlm output) to
 * the end of the component-generation system prompt.
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
