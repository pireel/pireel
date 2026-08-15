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

THEME DISTINCTIVENESS IS STRUCTURAL, NOT A RECOLOR:
- If the instruction includes DIRECTOR SCENE CONTEXT, treat its named signature treatment, visual anchor, composition, motion plan, sound plan, and B-roll decision as one binding scene contract. Do not discard them and design an isolated widget.
- Treat generic form nouns in the instruction (label, card, banner, CTA box) as the element's FUNCTION, not a mandatory visual solution, unless the user explicitly requested that literal shape.
- Silently identify at least TWO non-token signatures from the theme below — for example material treatment, spatial composition, type hierarchy, evidence device, image relationship, or motion grammar — and make both visible in this fragment. Palette and font choice do not count.
- A polished generic rectangle wearing the theme colors is a failure. For short copy, build a theme-specific composition with meaningful hierarchy and one restrained structural device rather than inflating it into a large opaque panel.
- Motion must express the same theme logic and the content's role; do not paste one universal slide/fade onto every fragment.

${theme}`;
}
