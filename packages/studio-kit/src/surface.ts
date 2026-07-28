/**
 * The surface a component sits on — its own property, not a wrapper the host paints around it.
 *
 * Every component owns how it uses these: a metric card fills its panel, a callout may set type
 * straight on footage, a lower third paints only its bar. That is the point of them living in the
 * component schema — the same "rounded, bordered, tinted" intent renders in each component's own
 * design language instead of a generic box drawn behind it.
 *
 * Colours are optional: empty means "follow the theme token", so a themed project restyles every
 * component at once and an explicitly set colour survives the theme change.
 */

import { tk } from './contract';
import { color, en, shownWhen, type Field } from './schema';
import type { TypeScale } from './sizing';

/** Shared surface fields — spread into a component's schema. */
export const SURFACE_FIELDS = {
  surface: en(['card', 'none'], 'card', 'card = the component paints its own panel; none = it sits directly on the footage'),
  surfaceColor: shownWhen(color('', 'Panel colour; empty follows the theme'), 'surface', ['card']),
  border: en(['none', 'hairline', 'solid'], 'none', 'Panel outline weight'),
  borderColor: shownWhen(color('', 'Outline colour; empty follows the theme'), 'border', ['hairline', 'solid']),
  radius: en(['sharp', 'soft', 'round', 'pill'], 'round', 'Corner treatment'),
} satisfies Record<string, Field<string>>;

export interface SurfaceProps {
  surface: string;
  surfaceColor: string;
  border: string;
  borderColor: string;
  radius: string;
}

/** Corner radius in CSS, from the chosen treatment. 'round' follows the theme's own radius token. */
export function radiusCss(p: Pick<SurfaceProps, 'radius'>, s: TypeScale): string {
  if (p.radius === 'sharp') return '0px';
  if (p.radius === 'soft') return `${Math.max(4, Math.round(s.gap * 0.3))}px`;
  if (p.radius === 'pill') return '999px';
  return tk('--sk-radius');
}

/**
 * The panel declaration for a component's own container: background, outline, radius, shadow.
 * Returns '' when the component is set to sit on bare footage — callers then reach for ink
 * contrast (heavier weight, a text shadow) instead of a plate.
 */
export function surfaceCss(p: SurfaceProps, s: TypeScale): string {
  const onCard = p.surface === 'card';
  const bw = p.border === 'hairline' ? Math.max(1, s.rule - 1) : p.border === 'solid' ? s.rule + 1 : 0;
  const outline = bw ? `border:${bw}px solid ${p.borderColor || tk('--sk-line')};` : '';
  if (!onCard) {
    // No panel: an outline alone still needs the radius to read as a frame
    return outline ? `${outline}border-radius:${radiusCss(p, s)};` : '';
  }
  return (
    `background:${p.surfaceColor || tk('--sk-panel')};` +
    `border-radius:${radiusCss(p, s)};` +
    `box-shadow:${tk('--sk-shadow')};` +
    outline
  );
}

/** True when the component paints a panel — the cue for ink colour and whether text needs a shadow. */
export const hasPanel = (p: Pick<SurfaceProps, 'surface'>) => p.surface === 'card';

/** Perceived lightness of a #rgb/#rrggbb/#rrggbbaa colour (0–1), alpha ignored. */
function lightness(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  if (full.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec. 709 luma, good enough to pick a side
}

/** Ink that stays readable on the component's own surface. A component owning its background owns
 *  legibility on it: pick a dark surface and the type flips light, with no separate setting to
 *  remember. Unset colours defer to the theme, which pairs its own ink with its own panel. */
export function inkOn(p: Pick<SurfaceProps, 'surface' | 'surfaceColor'>, muted = false): string {
  if (p.surface === 'card' && p.surfaceColor && lightness(p.surfaceColor) < 0.5) {
    return muted ? 'rgb(255 255 255 / 0.68)' : '#f7f6f4';
  }
  return muted ? tk('--sk-muted') : tk('--sk-fg');
}

/**
 * Surface swatches — a Morandi palette: low-saturation, grey-leaning colours that sit under
 * footage without competing with it. Saturated brand colours vibrate against moving video and
 * fight the accent; these hold their place. Ordered light to dark so a picker reads as a ramp,
 * and spanning warm/cool/neutral so a component can be tuned to the footage rather than to taste.
 *
 * Values are opaque; alpha is the caller's to add (#rrggbbaa) — a surface over busy footage often
 * wants to let some of it through.
 */
export const SURFACE_SWATCHES: { name: string; value: string }[] = [
  { name: 'Oat', value: '#EDE7DF' },
  { name: 'Blush', value: '#D9C4BE' },
  { name: 'Ochre', value: '#D2BC8E' },
  { name: 'Sage', value: '#A9B5A0' },
  { name: 'Mist', value: '#A3B2C2' },
  { name: 'Lilac', value: '#B0A3B8' },
  { name: 'Clay', value: '#BC8C79' },
  { name: 'Stone', value: '#9A958D' },
  { name: 'Slate', value: '#56555A' },
  { name: 'Ink', value: '#2E2C2B' },
];
