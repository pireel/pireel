/**
 * Themes — a skin, a voice, and stagings.
 *
 * A theme is not a colour swap. It carries three things, and the third is what makes projects
 * actually look different from each other:
 *
 *  - `palette`  the skin: token values every component already reads.
 *  - `voice`    what the theme is for and how it behaves, in the words a model needs when it is
 *               choosing a component and filling it in. Feeds the generation prompt.
 *  - `blueprints` stagings this theme brings (see blueprint.ts). With them the catalogue a model
 *               picks from changes with the theme, instead of every project drawing from one
 *               fixed set of built-in arrangements.
 *
 * Themes are data end to end, so one can be authored — by a person or a model — without touching
 * the library.
 */

import type { Blueprint } from './blueprint';

/** Token names without the `--sk-` prefix — the writable surface of a skin. */
export interface Palette {
  fg?: string;
  muted?: string;
  accent?: string;
  accent2?: string;
  panel?: string;
  panel2?: string;
  line?: string;
  radius?: string;
  shadow?: string;
  fontHead?: string;
  fontNum?: string;
}

export interface Theme {
  id: string;
  title: string;
  palette: Palette;
  /**
   * Written for the model that chooses and fills components. Two parts by convention: a sentence
   * or two of intent — what this theme is for, what it sounds like — then hard directives it must
   * follow. Prose alone drifts; directives alone read as a checklist and produce lifeless copy.
   */
  voice: string;
  blueprints?: Blueprint[];
}

const TOKEN: Record<keyof Palette, string> = {
  fg: '--sk-fg',
  muted: '--sk-muted',
  accent: '--sk-accent',
  accent2: '--sk-accent-2',
  panel: '--sk-panel',
  panel2: '--sk-panel-2',
  line: '--sk-line',
  radius: '--sk-radius',
  shadow: '--sk-shadow',
  fontHead: '--sk-font-head',
  fontNum: '--sk-font-num',
};

/** Palette → CSS custom properties. Set them on any ancestor of the blocks to apply the skin. */
export function themeVars(palette: Palette): string {
  return (Object.keys(TOKEN) as (keyof Palette)[])
    .filter((k) => palette[k])
    .map((k) => `${TOKEN[k]}:${palette[k]};`)
    .join('');
}

/** Blueprints this theme offers for a component — the extra stagings a model may pick from. */
export function themeBlueprints(theme: Theme | undefined, component: string): Blueprint[] {
  return (theme?.blueprints ?? []).filter((b) => b.component === component);
}
