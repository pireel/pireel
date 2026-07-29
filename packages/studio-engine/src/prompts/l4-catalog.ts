/**
 * L4 — the vocabulary: which components this preset can use, described from their schemas.
 *
 * Derived, never authored. Adding a component, a prop, an enum member or a cap changes this
 * section with no prompt edit — which is the point of the layer, and the thing a hand-written
 * catalogue cannot promise.
 */

import { catalogText, components, surfaceText } from '@pireel/studio-kit';

/** The catalogue section for a preset's component list. Unknown ids are skipped rather than
 *  failing: a preset naming a component that has since been removed still generates. */
export function catalogSection(componentIds: string[]): string {
  const subset = Object.fromEntries(componentIds.filter((id) => id in components).map((id) => [id, components[id as keyof typeof components]]));
  return `COMPONENTS
${catalogText(subset)}

SURFACE (every component takes these; they decide how it sits over the footage)
${surfaceText()}
  Leave colours empty to follow the theme. Over busy footage prefer surface "card"; over calm
  footage or a flat backdrop, "none" with the type set directly on it reads more confident.`;
}

/**
 * The same catalogue, framed for the MARKUP path. A themed fragment renders one of the house
 * component types in the THEME's own language — same vocabulary as the component path, derived
 * from the same schemas, so the two paths cannot disagree about what a metric or a kpi is.
 * Deliberately a floor, not a ceiling: free-form markup may go beyond when the content demands.
 */
export function componentNormsSection(componentIds: string[]): string {
  return `HOUSE COMPONENT TYPES — the shared vocabulary (a themed fragment renders one of these in the THEME's language; text caps are CONTENT budgets — what fits a box — not JSON fields):
${catalogSection(componentIds).split('\n').slice(1).join('\n')}
Content beyond the house types (a structure/hierarchy diagram, a loop/cycle, an annotated visual, something the user described) is composed freely — these norms are the floor of consistency, not a ceiling.`;
}
