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
