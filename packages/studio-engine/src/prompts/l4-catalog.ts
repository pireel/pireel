/**
 * L4 — the vocabulary: which components this preset can use, described from their schemas.
 *
 * Derived, never authored. Adding a component, a prop, an enum member or a cap changes this
 * section with no prompt edit — which is the point of the layer, and the thing a hand-written
 * catalogue cannot promise.
 */

import { type Blueprint, catalogText, components, surfaceText } from '@pireel/studio-kit';

/** Theme stagings offered on top of the built-in variants. Listed separately from the components
 *  because they come and go with the theme: same props, a staging drawn in the theme's own hand. */
function stagingSection(blueprints: Blueprint[]): string {
  if (!blueprints.length) return '';
  const lines = blueprints.map((b) => `    ${b.id} — ${b.component}: ${b.name}`).join('\n');
  return `

STAGINGS FROM THE PROJECT'S THEME (optional; same props, drawn in the theme's own hand)
${lines}
  Add "staging": "<id>" beside the component to use one. It must belong to the component you chose.
  Prefer a staging when one fits — it is what makes this project look like itself rather than like
  every other project. Omit it when none suits the content.`;
}

/** The catalogue section for a preset's component list. Unknown ids are skipped rather than
 *  failing: a preset naming a component that has since been removed still generates. */
export function catalogSection(componentIds: string[], blueprints: Blueprint[] = []): string {
  const subset = Object.fromEntries(componentIds.filter((id) => id in components).map((id) => [id, components[id as keyof typeof components]]));
  const usable = blueprints.filter((b) => componentIds.includes(b.component));
  return `COMPONENTS
${catalogText(subset)}

SURFACE (every component takes these; they decide how it sits over the footage)
${surfaceText()}
  Leave colours empty to follow the theme. Over busy footage prefer surface "card"; over calm
  footage or a flat backdrop, "none" with the type set directly on it reads more confident.
  A staging paints its own surface — these are ignored when you pick one.${stagingSection(usable)}`;
}
