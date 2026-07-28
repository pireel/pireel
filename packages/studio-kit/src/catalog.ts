/**
 * Catalogue text — the registry described for a model, DERIVED from the schemas.
 *
 * The prompt a model reads and the parser that accepts its answer must describe the same
 * thing. Hand-writing the catalogue guarantees they drift: a field gains a cap, an enum
 * gains a member, and the prompt still teaches last month's contract. So the text is
 * generated from `jsonSchema` — one definition, still three artifacts.
 *
 * Surface props are shared by every component, so they are described once, separately,
 * instead of repeating five lines eight times.
 */

import { SURFACE_FIELDS } from './surface';

type JsonSchema = Record<string, unknown>;

export interface CatalogDef {
  jsonSchema: JsonSchema;
  summary: string;
}

const SURFACE_KEYS = new Set(Object.keys(SURFACE_FIELDS));

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Compact form for a row's field — rows are listed inline, so this stays terse. */
function rowFieldText(name: string, s: JsonSchema): string {
  if (Array.isArray(s.enum)) return `${name}:${(s.enum as string[]).join('|')}`;
  if (s.type === 'string' && typeof s.maxLength === 'number') return `${name} ≤${s.maxLength}`;
  return name;
}

function typeText(s: JsonSchema): string {
  if (Array.isArray(s.enum)) return (s.enum as string[]).join(' | ');
  if (s.type === 'string' && s.format === 'color') return '#rrggbb / #rrggbbaa, "" = follow the theme';
  if (s.type === 'string') return typeof s.maxLength === 'number' ? `text ≤${s.maxLength}` : 'text';
  if (s.type === 'boolean') return 'true | false';
  if (s.type === 'number') return `number ${s.minimum ?? ''}…${s.maximum ?? ''}`;
  if (s.type === 'array') {
    const items = (s.items ?? {}) as JsonSchema;
    const props = (items.properties ?? {}) as Record<string, JsonSchema>;
    const inner = Object.entries(props)
      .map(([k, v]) => rowFieldText(k, v))
      .join(', ');
    return `up to ${s.maxItems ?? '?'} rows of { ${inner} }`;
  }
  return 'value';
}

function fieldLine(name: string, s: JsonSchema, required: boolean): string {
  let line = `${name}: ${typeText(s)}`;
  if (required) line += ' (required)';
  // Defaults are worth stating only where the model is picking among named options; for text
  // slots the default is a designed placeholder, and naming it invites the model to echo it.
  const showDefault = Array.isArray(s.enum) || s.type === 'boolean';
  const def = showDefault && s.default !== undefined ? String(s.default) : undefined;
  if (def) line += ` — default ${def}`;
  const desc = str(s.description);
  if (desc) line += def ? `. ${desc}` : ` — ${desc}`;
  const when = s.showWhen as { field?: string; in?: string[] } | undefined;
  if (when?.field && Array.isArray(when.in)) line += ` (only when ${when.field} = ${when.in.join('/')})`;
  return line;
}

/** Every component with its props, indented for embedding in a prompt section. */
export function catalogText(defs: Record<string, CatalogDef>): string {
  const out: string[] = [];
  for (const [id, def] of Object.entries(defs)) {
    out.push(`  ${id} — ${def.summary}`);
    const props = (def.jsonSchema.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set(((def.jsonSchema.required ?? []) as string[]) ?? []);
    for (const [k, s] of Object.entries(props)) {
      if (SURFACE_KEYS.has(k)) continue;
      out.push(`    ${fieldLine(k, s, required.has(k))}`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/** The surface props every component accepts, described once. */
export function surfaceText(): string {
  return Object.entries(SURFACE_FIELDS)
    .map(([k, f]) => `    ${fieldLine(k, f.jsonSchema, false)}`)
    .join('\n');
}
