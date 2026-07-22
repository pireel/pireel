/**
 * Theme — a preset design system, a first-class concept.
 *
 * Key model (calibrated 2026-06): theme = structure, colors = derived.
 *  - The theme fixes the structural things: layout grid, type-scale contrast,
 *    spacing, hairlines, restraint principles, component vocabulary, motion.
 *  - Colors are only NEUTRAL DEFAULTS; the real accent / panel warmth is derived
 *    and overridden from the pre-analyzed footage base color (themeForLlm takes a
 *    palette, assembleHtml layers derived vars after the default vars). That's how
 *    "general" holds up: structure is generic, color adapts per clip.
 *
 * Iron rule (à la Guizang / Anthropic pptx): presets ONLY, the agent picks but never
 * invents (protects taste). Two faces of a theme:
 *  1) brief — the structural design brief + constraints for the LLM (English md),
 *     injected into compose/plan system.
 *  2) vars/background — a set of directly-swappable CSS variables (neutral
 *     defaults) injected onto #root; a derived palette overrides the color items.
 */

import { THEME_GENERAL_BRIEF } from './prompts';

export type ThemeId = 'general';

export interface Theme {
  id: ThemeId;
  name: string;
  /** #root background (neutral default; a derived palette leaves it alone). */
  background: string;
  /** CSS custom properties (keys without --); templates/generated HTML use var(--key). Color items can be overridden by a derived palette. */
  vars: Record<string, string>;
  /** Whether auto-storyboard lays captions (per-sentence animated text). A structural choice set by the theme; general defaults off (designed graphics only). */
  captions: boolean;
  /** Structural design brief for the LLM (English md): structure/layout/fonts/motion/don'ts. The token table is appended automatically by themeForLlm. */
  brief: string;
}

// Design fonts (preview loads sliced via Google Fonts, see assembleHtml's FONT_LINKS; CJK dynamic text relies on
// unicode-range slicing, not pre-subsetting). Export must subset/inline the glyphs used + await document.fonts.ready before capturing frames (CLI alignment point).
const SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,"SF Mono","Roboto Mono",Menlo,monospace';

/**
 * General (default) — a structured "editorial/data" design system. Neutral
 * paper-ink default colors; accent/panel warmth derived from the footage base.
 * Goal: produce designed, laid-out fragments (cards/charts/flow/structure
 * diagrams/comparisons/KPIs), not captions.
 */
export const GENERAL_THEME: Theme = {
  id: 'general',
  name: '通用',
  background: '#f5f3ee',
  captions: false, // general lays no captions by default, only designed graphics (fragment ≠ caption)
  vars: {
    // —— Neutral default colors (a derived palette overrides accent / accent-2 / panel / line / grid) ——
    paper: '#f5f3ee',
    fg: '#16140f', // primary ink
    muted: 'rgba(22,20,15,0.56)', // secondary text/labels
    accent: '#d8472f', // single accent color (derived override)
    'accent-2': '#1f5fd0', // secondary accent, rarely used (derived override)
    panel: '#ffffff', // card base (derived tints warmth slightly)
    'panel-2': '#ece8df', // secondary panel/texture
    line: 'rgba(22,20,15,0.16)', // hairline (derived tints warmth)
    grid: 'rgba(22,20,15,0.07)', // grid/axis lines
    up: '#1f8f4e', // chart positive
    down: '#d8472f', // chart negative
    'font-head': SANS,
    'font-body': SANS,
    'font-num': MONO,
    radius: '14px',
    shadow: '0 10px 34px rgba(20,18,12,0.14)',
  },
  brief: THEME_GENERAL_BRIEF,
};

export const THEMES: Record<ThemeId, Theme> = { general: GENERAL_THEME };

export function getTheme(id: ThemeId | undefined): Theme {
  return (id && THEMES[id]) || GENERAL_THEME;
}

/** 6-digit hex → 8-digit hex with alpha (#rgb expanded first); non-hex (rgba/keywords) returned as-is. */
function withAlpha(color: string, alphaHex: string): string {
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(color.trim());
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}${alphaHex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(color.trim())) return `${color.trim()}${alphaHex}`;
  return color;
}

/** Theme vars (+ optional derived override) → declaration string injected onto
 *  #root. Derived comes last, overriding defaults. Card colors (panel/panel-2)
 *  get a uniform 90% opacity: components sit over the video, and a fully-opaque
 *  card blots out the footage (user's call: all theme backgrounds carry alpha by
 *  default). paper is left alone — it's both the canvas base and, in some
 *  dialects, the reversed-out text color (color:var(--paper)); adding alpha would
 *  wash the text out. */
export function themeVarsCss(theme: Theme, palette?: Record<string, string>): string {
  const all = { ...theme.vars, ...(palette ?? {}) };
  for (const k of ['panel', 'panel-2']) {
    if (all[k]) all[k] = withAlpha(all[k], 'e6');
  }
  return Object.entries(all)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');
}

/** Theme → full brief for the LLM: brief (structural constraints) + an
 *  auto-assembled token table (single-source vars + derived override, no drift).
 *  Injected into compose/plan system as the vehicle for "presets only, pick don't
 *  invent". A derived palette lets the LLM see the real accent. */
export function themeForLlm(theme: Theme, palette?: Record<string, string>): string {
  const all = { ...theme.vars, ...(palette ?? {}) };
  const tokens = Object.entries(all)
    .map(([k, v]) => `--${k}: ${v};`)
    .join('\n');
  return `${theme.brief}

## Design tokens (use via var(--name); colors are DERIVED FROM THE FOOTAGE — do NOT invent other colors or fonts)
${tokens}
root background: ${theme.background}`;
}
