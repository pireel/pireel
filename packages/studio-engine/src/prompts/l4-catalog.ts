/**
 * L4 — the query-time vocabulary: which retrieved Motion Graphic Components this moment can use, described from
 * their schemas.
 *
 * Derived, never authored. Adding a preset grows the retrieval index, not every prompt; adding
 * a prop, enum member or cap changes the section only when that preset is retrieved.
 */

import { catalogText, components, surfaceText } from '@pireel/studio-kit';

/** The catalogue section for a preset's Motion Graphic Component list. Unknown ids are skipped rather than
 *  failing: a preset naming a Component that has since been removed still generates. */
export function catalogSection(componentIds: string[]): string {
  const subset = Object.fromEntries(componentIds.filter((id) => id in components).map((id) => [id, components[id as keyof typeof components]]));
  if (!Object.keys(subset).length) {
    return `MOTION GRAPHIC TYPES
  No registered Motion Graphic Component schema matched this request. Do not invent an id: answer {"custom": true}
  when the moment still deserves a bespoke graphic, or null when it deserves no graphic.`;
  }
  return `MOTION GRAPHIC TYPES
${catalogText(subset)}

SURFACE (every Motion Graphic Component takes these; they decide how it sits over the footage)
${surfaceText()}
  Leave colours empty to follow the theme. Over busy footage prefer surface "card"; over calm
  footage or a flat backdrop, "none" with the type set directly on it reads more confident.`;
}

/**
 * The same catalogue, framed for the MARKUP path. A themed fragment renders one of the house
 * Motion Graphic Component types in the THEME's own language — same vocabulary as the preset path, derived
 * from the same schemas, so the two paths cannot disagree about what a metric or a kpi is.
 * Deliberately a floor, not a ceiling: free-form markup may go beyond when the content demands.
 */
export function componentNormsSection(componentIds: string[]): string {
  if (!componentIds.some((id) => id in components)) {
    return 'HOUSE MOTION GRAPHIC TYPES: retrieval found no close house Motion Graphic Component for this request. Compose the requested content freely; do not imitate or invent a registered schema.';
  }
  return `HOUSE MOTION GRAPHIC TYPES: the shared vocabulary (a themed fragment renders one of these in the THEME's language; text caps are CONTENT budgets for what fits a box, not JSON fields):
${catalogSection(componentIds).split('\n').slice(1).join('\n')}
Content beyond the house types (a structure/hierarchy diagram, a loop/cycle, an annotated visual, something the user described) is composed freely. These norms are the floor of consistency, not a ceiling.`;
}
