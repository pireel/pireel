/**
 * L4 — the query-time vocabulary: which retrieved components this moment can use, described from
 * their schemas.
 *
 * Derived, never authored. Adding a component grows the retrieval index, not every prompt; adding
 * a prop, enum member or cap changes the section only when that component is retrieved.
 */

import { catalogText, components, surfaceText } from '@pireel/studio-kit';

/** The catalogue section for a preset's component list. Unknown ids are skipped rather than
 *  failing: a preset naming a component that has since been removed still generates. */
export function catalogSection(componentIds: string[]): string {
  const subset = Object.fromEntries(componentIds.filter((id) => id in components).map((id) => [id, components[id as keyof typeof components]]));
  if (!Object.keys(subset).length) {
    return `COMPONENTS
  No registered component schema matched this request. Do not invent an id: answer {"custom": true}
  when the moment still deserves a bespoke graphic, or null when it deserves no graphic.`;
  }
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
  if (!componentIds.some((id) => id in components)) {
    return 'HOUSE COMPONENT TYPES — retrieval found no close house component for this request. Compose the requested content freely; do not imitate or invent a registered component schema.';
  }
  return `HOUSE COMPONENT TYPES — the shared vocabulary (a themed fragment renders one of these in the THEME's language; text caps are CONTENT budgets — what fits a box — not JSON fields):
${catalogSection(componentIds).split('\n').slice(1).join('\n')}
Content beyond the house types (a structure/hierarchy diagram, a loop/cycle, an annotated visual, something the user described) is composed freely — these norms are the floor of consistency, not a ceiling.`;
}
