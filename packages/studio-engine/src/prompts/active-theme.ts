/**
 * ACTIVE THEME wrapper: appends the current theme brief (themeForLlm output) to
 * the end of the Motion Graphic Component-generation system prompt.
 * Variable injection = function params + native ${}, compile-time safety net.
 */

/** compose: presets only, select don't invent. */
export function withActiveTheme(system: string, theme?: string): string {
  if (!theme) return system;
  return `${system}

=== ACTIVE THEME (preset design system) ===
The theme fills only unspecified visual decisions. Resolve conflicts in this order: the latest explicit user instruction; the current project/manual UI controls; saved custom visual controls; then this theme. Current manual caption, layout, palette, canvas, crop and placement choices are user decisions—preserve them. Never reapply a theme default over a newer project value. Within the remaining freedom, use the theme's tokens via var(--name); do NOT invent new palettes, fonts, or backgrounds.

FIXED PRODUCT SURFACES:
- The Code Motion Graphic owns its editor chrome, syntax colors, diff colors, line focus and animation grammar. Do not rebuild or recolor that internal code viewport from the active visual direction. The theme may only position the Code block and design the surrounding scene.

THEME DISTINCTIVENESS IS STRUCTURAL, NOT A RECOLOR:
- If the instruction includes DIRECTOR SCENE CONTEXT, treat its content-specific Scene treatment, visual anchor, composition, motion plan, sound plan, and B-roll decision as one binding scene contract. The Frame styles that decision; it does not replace it with one of its showcase examples. Do not discard the contract and design an isolated widget.
- Treat generic form nouns in the instruction (label, card, banner, CTA box) as the element's FUNCTION, not a mandatory visual solution, unless the user explicitly requested that literal shape.
- Silently identify at least TWO non-token signatures from the theme below — for example material treatment, spatial composition, type hierarchy, evidence device, image relationship, or motion grammar — and make both visible in this fragment. Palette and font choice do not count.
- A polished generic rectangle wearing the theme colors is a failure. For short copy, build a theme-specific composition with meaningful hierarchy and one restrained structural device rather than inflating it into a large opaque panel.
- Motion must express the same theme logic and the content's role; do not paste one universal slide/fade onto every fragment.

${theme}`;
}
