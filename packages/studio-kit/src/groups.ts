/**
 * The shared property model. Every component's properties fall into the same fixed groups, in the
 * same order, so an editor draws one panel for all of them and a model learns one vocabulary:
 *
 *   layout  — the component's own layouts (`variant`), the only per-component choice of form
 *   content — what it says: text, numbers, rows (named by the component, since content is its own)
 *   style   — accent, text colour, typeface, type size: shared by every component, applied by the host
 *   surface — panel, outline, corners (SURFACE_FIELDS)
 *   motion  — how it enters
 *
 * Groups are assigned by kind, not declared per component: a new component that spreads the shared
 * fields and names its content lands in the right groups with no editor work.
 */

import { color, num, type Field } from './schema';
import { SURFACE_FIELDS } from './surface';

export const PROPERTY_GROUPS = ['layout', 'content', 'style', 'surface', 'motion'] as const;
export type PropertyGroup = (typeof PROPERTY_GROUPS)[number];

/** A typeface id (web:<id>, google:<Family>, local:<family> or a built-in id); empty follows the theme. */
function font(description: string): Field<string> {
  return {
    jsonSchema: { type: 'string', format: 'font', maxLength: 120, default: '', description },
    fallback: '',
    coerce: (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : undefined),
  };
}

/** Shown to people as a percentage (1 → 100%); the stored value stays the factor. */
function percent(f: Field<number>): Field<number> {
  return { ...f, jsonSchema: { ...f.jsonSchema, 'x-display': 'percent' } };
}

/** Style every component takes. The host applies them around the component (token overrides and a
 *  type-size factor), so a component needs no code to honour them. */
export const STYLE_FIELDS = {
  accent: color('', 'Accent colour; empty follows the theme'),
  ink: color('', 'Text colour; empty is light over footage and the theme ink on a page'),
  font: font('Display typeface; empty follows the theme'),
  textScale: percent(num(0.7, 1.5, 1, 'Type size, relative to the designed size')),
} satisfies Record<string, Field<unknown>>;

const MOTION_KEYS = new Set(['motion', 'pace']);

/** Place a component's own property in a shared group when its kind alone would misfile it
 *  (a code colour scheme is style, not content). */
export function inGroup<T>(f: Field<T>, group: PropertyGroup): Field<T> {
  return { ...f, jsonSchema: { ...f.jsonSchema, 'x-group': group } };
}

/** The group a property belongs to, by what it is. */
export function groupOf(key: string, schema?: { format?: unknown; type?: unknown; 'x-group'?: unknown }): PropertyGroup {
  const declared = schema?.['x-group'];
  if (typeof declared === 'string' && (PROPERTY_GROUPS as readonly string[]).includes(declared)) return declared as PropertyGroup;
  if (key === 'variant') return 'layout';
  if (key in STYLE_FIELDS) return 'style';
  if (key in SURFACE_FIELDS) return 'surface';
  if (MOTION_KEYS.has(key)) return 'motion';
  // Properties outside the shared vocabulary (bespoke components): colours and faces are style.
  if (schema?.format === 'color' || schema?.format === 'font') return 'style';
  return 'content';
}
