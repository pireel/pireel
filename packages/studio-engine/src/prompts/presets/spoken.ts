/**
 * L2 preset "spoken" — talking-head video, the only preset today.
 *
 * A preset owns two things: the editorial judgment for its domain (L3.1) and which components its
 * vocabulary contains (L4). Everything above it (the base contract, the props grammar) and the
 * theme voice below it are preset-independent.
 *
 * L3.1 is shared by both generation paths on purpose. Whether the model writes markup or picks a
 * component, "put the spoken figure on screen verbatim" and "say nothing when there is nothing to
 * say" are the same rules; two copies would drift the moment one is tuned.
 */

import { ON_SCREEN_LANGUAGE } from '../l0-editor';

/** L3.1 — how to decide what goes on screen in a talking-head piece. */
export const SPOKEN_EDITORIAL = `WHAT EARNS A GRAPHIC
The speaker is the piece; a graphic exists to carry what speech carries badly — a figure, a
comparison, a list, a name, a verdict. If this moment has no hard content (a connective line, a
breath, a restatement), the honest answer is NO graphic. Decoration over a face is worse than
nothing. The same goes for REPEATS: when a neighbouring graphic already carries this figure or
claim (the neighbour list shows what each one holds), this moment earns nothing — a duplicated
card reads as a glitch, not emphasis. ONE exception: when the brief itself asks for a compact
echo of a hero graphic after a framing change, build it small — that handoff is a technique,
not a repeat.

WHAT IT SAYS
- Take figures, names and keywords VERBATIM from what was actually said. Never invent a number, and
  never round one that was stated precisely.
- ONE idea per graphic. It has to read in one to two seconds while someone is talking over it.
- LANGUAGE: ${ON_SCREEN_LANGUAGE}
- Do NOT produce a running subtitle or a plain lower-third of the narration unless the instruction
  explicitly asks for subtitles or a keyword caption.

VARIETY (always secondary to fit)
When the prompt lists the video's other graphics, avoid producing a carbon copy of a neighbour: all
else equal, choose a different treatment. If the same treatment genuinely fits this content best,
keep it and differentiate the staging instead — alignment, motion flavour, secondary devices. NEVER
pick a worse-fitting treatment just to be different.

TIMING
You are told how long the graphic is on screen, and — when the speech is aligned — when each thing
is said. Sequential content (steps, a list, a pipeline, a timeline) reveals ONE BY ONE across that
duration at presenter rhythm, each item landing when its content is spoken. Non-sequential content
gets one calm reveal near the start, then holds still.

NAMED MOVES
The brief may name an editing move — HANDOFF (build the compact echo, badge-small), ANCHOR (this
graphic outlives its scene: keep it badge-small and self-contained), BUILD (reveals ride the
spoken beats, one item each), SETUP→PAYOFF (this graphic is the question or the answer — tease
small, land big), PUNCH, CHAPTER (a small indexed section marker). A named move is the brief's
intent: execute the pattern, don't reinterpret it.`;

export interface Preset {
  id: string;
  /** Human label (UI copy lives in the app; this is for logs and briefs). */
  title: string;
  /** L3.1 — the domain's editorial judgment. */
  editorial: string;
  /** L4 — the component ids this preset's vocabulary contains. */
  components: string[];
}

export const SPOKEN_PRESET: Preset = {
  id: 'spoken',
  title: 'Talking-head',
  editorial: SPOKEN_EDITORIAL,
  // Every component today. A second preset is what will make this list mean something — until then
  // it stays exhaustive rather than pretending to a curation nobody has done.
  components: ['metric', 'kpi', 'comparison', 'chart', 'steps', 'callout', 'lowerThird', 'title'],
};
