/**
 * L1 — the props grammar.
 *
 * Not the list of Motion Graphic Components (that is L4, derived per preset) but the SHAPE any Component preset's
 * contract takes: which field kinds exist, what a cap or an enum means, and what happens to an
 * answer that doesn't fit. Two different readers need it:
 *
 *  - a model filling an existing Motion Graphic Component — knowing that parsing clamps rather than fails is
 *    what makes a partial answer safe to give;
 *  - later, a model AUTHORING a Motion Graphic Component preset — this is the grammar it has to write in. That is why
 *    the layer exists separately from the catalogue: the catalogue is vocabulary, this is syntax,
 *    and only vocabulary changes with the preset.
 *
 * Kept in sync with schema.ts by construction — each field kind here is one of its primitives.
 */

export const L1_PROPS_SPEC = `HOW MOTION GRAPHIC COMPONENT PROPS WORK
A Motion Graphic Component preset is a fixed set of typed fields. You fill fields; the preset owns everything
else: layout, type scale, spacing, colour, motion and legibility. Sizes are computed from the real
box, so you cannot make a preset overflow and you never state a size.

FIELD KINDS
- enum ("a | b | c") — a closed set. Pick one of the listed members; anything else is discarded.
- text ≤N — a length cap in characters. It is a layout guarantee, not a suggestion: text over the
  cap is cut. If a line will not fit, cut words, don't shrink meaning.
- number min…max — clamped into range.
- true | false — a switch.
- colour — #rrggbb or #rrggbbaa. Empty means "follow the theme", which is almost always right.
- rows of { … } — a bounded list; rows past the limit are dropped from the end.

WHAT HAPPENS TO YOUR ANSWER
Every field is coerced, never rejected: unknown keys are dropped, out-of-range numbers clamp,
wrong types and missing fields fall back to designed defaults. A Motion Graphic Component with only its required
field filled renders as a finished piece of design. So:
- Leave a field out when you have nothing true to put in it. An empty field renders cleanly; an
  invented one is a lie on screen.
- Guessing a member name that isn't listed silently gets you the default, not an error. Read the
  listed values.`;
