/**
 * One schema definition, three artifacts:
 *
 *  1. a JSON Schema (draft 2020-12) — hand to an LLM as a structured-output /
 *     tool-call contract, or to any validator;
 *  2. a TypeScript type — inferred, no duplication;
 *  3. a `parse` function — the runtime gate. It NEVER throws: unknown keys are
 *     dropped, out-of-range numbers are clamped, wrong-typed or missing fields
 *     fall back to their designed defaults, overlong text is trimmed. Whatever a
 *     model emits, the component receives well-formed props and renders something
 *     presentable. Malformed input degrades, it does not break.
 *
 * Every field except explicit `required` content carries a designed default —
 * `{ value: "47%" }` alone must render a finished-looking block.
 */

type JsonSchema = Record<string, unknown>;

interface FieldBase<T> {
  jsonSchema: JsonSchema;
  /** Absent only on required fields. */
  fallback?: T;
  required?: true;
  coerce: (v: unknown) => T | undefined;
}

export type Field<T> = FieldBase<T>;

/** Closed enum. First-class variant axis — additions are fine, removals never (old props must render forever). */
export function en<const V extends readonly string[]>(
  values: V,
  fallback: V[number],
  description?: string,
): Field<V[number]> {
  return {
    jsonSchema: { type: 'string', enum: [...values], default: fallback, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => (typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as V[number]) : undefined),
  };
}

/** Bounded number; out-of-range input clamps instead of failing. */
export function num(min: number, max: number, fallback: number, description?: string): Field<number> {
  return {
    jsonSchema: { type: 'number', minimum: min, maximum: max, default: fallback, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v) : NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
    },
  };
}

export function bool(fallback: boolean, description?: string): Field<boolean> {
  return {
    jsonSchema: { type: 'boolean', default: fallback, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => (typeof v === 'boolean' ? v : undefined),
  };
}

/** Text slot. Trimmed to maxLen (grapheme-naive by design: length is a layout
 *  guard, not a typography rule). Optional unless marked required via `text.req`. */
export function text(maxLen: number, fallback = '', description?: string): Field<string> {
  return {
    jsonSchema: { type: 'string', maxLength: maxLen, default: fallback, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => (typeof v === 'string' ? v.slice(0, maxLen) : typeof v === 'number' ? String(v).slice(0, maxLen) : undefined),
  };
}

/** Required text — the only kind of field with no fallback. Parse substitutes a
 *  visible placeholder rather than failing: a wrong render beats a blank canvas. */
export function reqText(maxLen: number, placeholder: string, description?: string): Field<string> {
  return {
    jsonSchema: { type: 'string', maxLength: maxLen, minLength: 1, ...(description ? { description } : {}) },
    required: true,
    fallback: placeholder,
    coerce: (v) => {
      const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
      const t = s.slice(0, maxLen);
      return t.trim() ? t : undefined;
    },
  };
}

/** Colour slot: #rgb / #rrggbb / #rrggbbaa, or empty meaning "use the theme token".
 *  Anything else falls back — a component never receives a value it cannot paint. */
export function color(fallback = '', description?: string): Field<string> {
  return {
    jsonSchema: { type: 'string', format: 'color', default: fallback, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => {
      if (typeof v !== 'string') return undefined;
      const t = v.trim();
      if (!t) return '';
      return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) ? t : undefined;
    },
  };
}

/**
 * Mark a field as only meaningful while another field holds one of `values` — a surface colour
 * means nothing with no surface, an outline colour nothing with no outline. Editors read this to
 * hide the field; it is advisory metadata, so validation and rendering are unaffected (a hidden
 * field keeps its stored value and comes back unchanged when the dependency returns).
 */
export function shownWhen<T>(f: Field<T>, field: string, values: string[]): Field<T> {
  return { ...f, jsonSchema: { ...f.jsonSchema, showWhen: { field, in: values } } };
}

/** Bounded list of row objects (rankings, steps, kpi cells…). Rows beyond maxItems
 *  are dropped from the end; each row's fields go through the same coercion. */
export function rows<F extends Record<string, Field<unknown>>>(
  fields: F,
  maxItems: number,
  fallback: Array<{ [K in keyof F]: F[K] extends Field<infer T> ? T : never }> = [],
  description?: string,
): Field<Array<{ [K in keyof F]: F[K] extends Field<infer T> ? T : never }>> {
  type Row = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };
  const rowSchema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.jsonSchema])),
    required: Object.entries(fields)
      .filter(([, f]) => f.required)
      .map(([k]) => k),
  };
  return {
    jsonSchema: { type: 'array', items: rowSchema, maxItems, ...(description ? { description } : {}) },
    fallback,
    coerce: (v) => {
      if (!Array.isArray(v)) return undefined;
      const out: Row[] = [];
      for (const item of v.slice(0, maxItems)) {
        if (typeof item !== 'object' || item === null) continue;
        const row: Record<string, unknown> = {};
        for (const [k, f] of Object.entries(fields)) {
          const c = f.coerce((item as Record<string, unknown>)[k]);
          row[k] = c !== undefined ? c : f.fallback;
        }
        out.push(row as Row);
      }
      return out;
    },
  };
}

export type PropsOf<S> = S extends Schema<infer F> ? { [K in keyof F]: F[K] extends Field<infer T> ? T : never } : never;

export interface Schema<F extends Record<string, Field<unknown>>> {
  /** JSON Schema (draft 2020-12), additionalProperties:false — the LLM contract. */
  jsonSchema: JsonSchema;
  /** All-defaults props (required fields take their placeholder). */
  defaults: { [K in keyof F]: F[K] extends Field<infer T> ? T : never };
  /** The runtime gate. Never throws. */
  parse: (input: unknown) => { [K in keyof F]: F[K] extends Field<infer T> ? T : never };
}

export function defineSchema<F extends Record<string, Field<unknown>>>(fields: F): Schema<F> {
  type P = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };
  const defaults = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.fallback])) as P;
  return {
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.jsonSchema])),
      required: Object.entries(fields)
        .filter(([, f]) => f.required)
        .map(([k]) => k),
    },
    defaults,
    parse: (input: unknown): P => {
      const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
      const out: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(fields)) {
        const c = f.coerce(src[k]);
        out[k] = c !== undefined ? c : f.fallback;
      }
      return out as P;
    },
  };
}
