/**
 * The words contract of a look's pieces, checked by running them: every word a graphic shows comes
 * from its props, every text prop shows, and an empty prop shows nothing.
 *
 * A piece that hard-codes this video's wording, ignores a prop, or falls back to its default when a
 * prop is emptied renders the wrong words the moment someone edits it — and the agent cannot tell
 * from the source it just wrote. So the browser renders each piece with marker props (one variant
 * with every text prop set, one per text prop emptied) and this module reads the rendered text.
 *
 * A prop may also mark part of another prop's text instead of showing on its own: the word of a
 * title to highlight. With marker values it matches nothing and shows nowhere, which used to read as
 * "never shows": two real edits had such a piece refused, one of them four rewrites in a row before
 * the model gave the piece up. So each text prop is also rendered holding a part of every other
 * text prop's marker ('within:<key>:<other>'); a prop whose markup changes then is in use.
 */

import type { DocumentLook, LookIssue } from './look';

export interface LookPieceProbe {
  pieceId: string;
  /** Variant name → props. 'base' sets every text prop to a marker; 'empty:<key>' empties one;
   *  'within:<key>:<other>' sets one to a part of another's marker. */
  variants: Record<string, Record<string, unknown>>;
  /** Text props (and list props, whose rows carry text) with the markers each one renders. */
  markers: Record<string, string[]>;
}

/** What one variant rendered: its visible text (and its markup, where the renderer gives it), or the
 *  error the piece threw. */
export type LookProbeRender = { text: string; html?: string } | { error: string };

type Field = { type?: unknown; enum?: unknown; format?: unknown; default?: unknown; items?: { properties?: Record<string, Field> } };

const isTextField = (field: Field | undefined) => field?.type === 'string' && !Array.isArray(field.enum) && field.format !== 'color' && field.format !== 'font';

function sampleValue(field: Field): unknown {
  if (Array.isArray(field.enum) && field.enum.length) return field.default ?? field.enum[0];
  if (field.type === 'boolean') return true;
  if (field.type === 'number' || field.type === 'integer') return typeof field.default === 'number' ? field.default : 1;
  return field.default;
}

/** The marker props for every piece of a look. */
export function lookPieceProbes(look: DocumentLook): LookPieceProbe[] {
  return Object.entries(look.pieces).map(([pieceId, piece]) => {
    const properties = ((piece.propsSchema as { properties?: Record<string, Field> } | undefined)?.properties ?? {}) as Record<string, Field>;
    let n = 0;
    const marker = () => `qz${(n++).toString(36)}k`;
    const base: Record<string, unknown> = {};
    const markers: Record<string, string[]> = {};
    for (const [key, field] of Object.entries(properties)) {
      if (isTextField(field)) {
        const value = marker();
        base[key] = value;
        markers[key] = [value];
      } else if (field.type === 'array' && field.items?.properties) {
        const rowFields = Object.entries(field.items.properties).filter(([, rowField]) => isTextField(rowField)).map(([name]) => name);
        if (!rowFields.length) continue;
        const rows = [0, 1].map(() => Object.fromEntries(rowFields.map((name) => [name, marker()])));
        base[key] = rows;
        markers[key] = rows.flatMap((row) => Object.values(row) as string[]);
      } else {
        const value = sampleValue(field);
        if (value !== undefined) base[key] = value;
      }
    }
    const variants: Record<string, Record<string, unknown>> = { base };
    for (const key of Object.keys(markers)) variants[`empty:${key}`] = { ...base, [key]: Array.isArray(base[key]) ? [] : '' };
    // A plain text prop holding the inner part of another prop's marker: what a "word to highlight" would hold.
    for (const key of Object.keys(markers)) {
      if (typeof base[key] !== 'string') continue;
      for (const [other, values] of Object.entries(markers)) {
        if (other !== key) variants[`within:${key}:${other}`] = { ...base, [key]: values[0]!.slice(1, -1) };
      }
    }
    return { pieceId, variants, markers };
  });
}

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, '');

/** Characters of `text` left over after matching `reference` in order (the words one added). */
function addedText(text: string, reference: string): string {
  let out = '';
  let j = 0;
  for (const ch of text) {
    if (j < reference.length && ch === reference[j]) j++;
    else out += ch;
  }
  return out;
}

const WORDS = /[\p{L}]{2,}/gu;

/** Hard issues break edits (the set_look is refused); soft ones are reported with the receipt. */
export function lookPieceContractIssues(
  probe: LookPieceProbe,
  renders: Record<string, LookProbeRender>,
): { hard: LookIssue[]; soft: LookIssue[] } {
  const path = `look.pieces.${probe.pieceId}`;
  const hard: LookIssue[] = [];
  const soft: LookIssue[] = [];
  const base = renders.base;
  if (!base || 'error' in base) {
    hard.push({ path: `${path}.source`, message: `the piece failed with ordinary props: ${base && 'error' in base ? base.error : 'it rendered nothing'}` });
    return { hard, soft };
  }
  const allMarkers = Object.values(probe.markers).flat();
  const strip = (text: string) => allMarkers.reduce((acc, value) => acc.split(value).join(''), squash(text));
  const shown = squash(base.text);
  for (const [key, values] of Object.entries(probe.markers)) {
    if (values.some((value) => shown.includes(value))) continue;
    // Not text of its own: in use all the same if it changes the markup when it holds a part of
    // another prop's text (it marks that part).
    const marks = base.html !== undefined && Object.entries(renders).some(([variant, render]) =>
      variant.startsWith(`within:${key}:`) && !('error' in render) && render.html !== undefined && render.html !== base.html);
    if (marks) continue;
    hard.push({ path: `${path}.source`, message: `prop "${key}" never shows: a text prop appears in the markup (read props.${key}, not fixed wording), or marks a part of another text prop that contains it (wrap that part in an element); this one does neither. If the piece has no use for it, take it out of propsSchema.` });
  }
  const fixed = strip(base.text);
  for (const key of Object.keys(probe.markers)) {
    const emptied = renders[`empty:${key}`];
    if (!emptied) continue;
    if ('error' in emptied) {
      hard.push({ path: `${path}.source`, message: `the piece fails when "${key}" is empty: ${emptied.error}` });
      continue;
    }
    const extra = (addedText(strip(emptied.text), fixed).match(WORDS) ?? []).join(' ');
    if (extra) {
      hard.push({ path: `${path}.source`, message: `an empty "${key}" still shows "${extra.slice(0, 40)}": an empty prop renders nothing (fall back to a default only when the prop is absent)` });
    }
  }
  const wording = [...new Set(fixed.match(WORDS) ?? [])].join(' ');
  if (wording) {
    soft.push({ path: `${path}.source`, message: `fixed text "${wording.slice(0, 60)}" cannot be edited per graphic; if it is this video's wording, make it a prop` });
  }
  return { hard, soft };
}
