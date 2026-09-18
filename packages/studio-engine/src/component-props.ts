/**
 * Editable properties of a bespoke Motion Graphic component.
 *
 * The generating model declares a small properties SCHEMA (JSON Schema `properties`) as its own
 * fenced ```json block, and Studio stores it in `slots.propsSchema` — the SAME vocabulary the
 * registered (kit) components use: `{"accent":{"type":"string","format":"color","title":"强调色","default":"#ff5a36"},
 * "value":{"type":"number","minimum":0,"maximum":100,"default":72},"badge":{"type":"boolean","default":true},
 * "layout":{"type":"string","enum":["row","column"],"default":"row"},"face":{"type":"string","format":"font","default":"sans"}}`.
 * One schema vocabulary means one form, one agent tool, one read-back for bespoke and registered
 * components alike (see component-schema.ts). Keeping the schema out of the markup — instead of an
 * inline `data-props` attribute — avoids JSON-in-an-HTML-attribute escaping and lets the model emit
 * it as a clean fence.
 * The markup consumes a property only through `var(--p-<key>)` (colour, unitless number) and
 * `#ID[data-p-<key>="v"]` attribute selectors (boolean "true"/"false", select option). It never
 * writes `--p-*` or `data-p-*` itself: the assembler materializes every declared property
 * (override ?? default) as inline custom properties and `data-p-*` attributes on the block
 * CONTAINER, so inline beats every stylesheet, the live preview channel writes the same things
 * without a rebuild, and the export (which serializes the container verbatim) carries them.
 *
 * Overrides persist in `slots.props` (additive, optional); defaults live in the schema. Text is
 * not a property — `data-edit` already covers it; images are `<img>` slots.
 *
 * This module imports only the two formatting helpers from composition-core so assemble, lint,
 * the v3 state view and the UI can all depend on it without cycles.
 */
import { escapeAttr, n } from './composition-core';
import { displayTextFontCss, isDisplayTextFontId } from './display-text-presets';

export type ComponentPropType = 'color' | 'number' | 'boolean' | 'select' | 'font';
export type ComponentPropValue = string | number | boolean;

export interface ComponentPropSpec {
  key: string;
  type: ComponentPropType;
  label: string;
  default: ComponentPropValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export type ComponentPropsOverrides = Record<string, ComponentPropValue>;

export const COMPONENT_PROPS_MAX = 8;
export const COMPONENT_PROP_KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const COLOR_VALUE = /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|var\(--[a-z][\w-]*\))$/i;
const OPTION_TOKEN = /^[a-z0-9][a-z0-9-]*$/;
const MANIFEST_ATTR = /\sdata-props\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const TYPES: ReadonlySet<string> = new Set(['color', 'number', 'boolean', 'select', 'font']);

/** Decode the entities an HTML serializer can put into an attribute (DOMParser round-trips in the
 *  editor rewrite `'…"…'` into `"…&quot;…"`). Both quote styles must parse to the same manifest. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** The properties schema for a component: its own `slots.propsSchema` string, or — for a component
 *  saved before the schema moved out of the markup — the legacy inline `data-props` attribute value
 *  extracted from `slots.innerHtml`. Back-compat with zero migration. */
export function blockPropsSchema(block: { templateId: string; slots: Record<string, unknown> }): string | undefined {
  const schema = block.slots.propsSchema;
  if (typeof schema === 'string' && schema.trim()) return schema;
  const innerHtml = block.slots.innerHtml;
  if (typeof innerHtml === 'string') {
    const match = MANIFEST_ATTR.exec(innerHtml);
    if (match) return decodeEntities(match[1] ?? match[2] ?? '');
  }
  return undefined;
}

/** Pull the bare `properties` map out of a schema string — accepting both `{properties:{…}}` (a whole
 *  schema) and the bare map. `null` when the string is absent/empty or not a JSON object. */
function propertiesOf(schemaJson: string | undefined): Record<string, unknown> | null {
  if (!schemaJson || !schemaJson.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const props = 'properties' in obj && obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)
    ? (obj.properties as Record<string, unknown>)
    : obj;
  return props && !Array.isArray(props) ? props : null;
}

/** Whether a component declares a properties schema (present and a non-empty object, or present but
 *  malformed — still "declared", so the lint reports props-invalid rather than "missing"). */
export function hasComponentPropsManifest(schemaJson: string | undefined): boolean {
  if (!schemaJson || !schemaJson.trim()) return false;
  const props = propertiesOf(schemaJson);
  if (props) return Object.keys(props).length > 0;
  // Non-empty string that is not a valid properties object: declared but broken.
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Read the properties schema (JSON Schema `properties`). Never throws: an invalid schema yields
 *  `specs: []` plus one issue per problem, so rendering degrades to "no properties" while the lint
 *  reports exactly what to fix. Each property becomes a normalized spec the rest of the module works
 *  from. `undefined`/empty → no properties (not an error). */
export function parseComponentProps(schemaJson: string | undefined): { specs: ComponentPropSpec[]; issues: string[] } {
  if (!schemaJson || !schemaJson.trim()) return { specs: [], issues: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaJson);
  } catch {
    return { specs: [], issues: ['the properties schema is not valid JSON (an object of JSON Schema properties: {"<key>":{"type":…,"default":…}})'] };
  }
  // `{properties:{…}}` (a whole schema) and the bare properties map are both accepted.
  const props = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? ('properties' in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).properties === 'object'
      ? (parsed as { properties: Record<string, unknown> }).properties
      : (parsed as Record<string, unknown>))
    : null;
  if (!props || Array.isArray(props)) return { specs: [], issues: ['the properties schema must be a JSON object: {"<key>": {"type": …, "default": …}, …} (the same JSON Schema properties a registered component declares)'] };
  const issues: string[] = [];
  const specs: ComponentPropSpec[] = [];
  const keys = Object.keys(props);
  if (keys.length > COMPONENT_PROPS_MAX) issues.push(`the properties schema declares ${keys.length} properties; at most ${COMPONENT_PROPS_MAX} are allowed`);
  for (const key of keys.slice(0, COMPONENT_PROPS_MAX)) {
    const e = props[key];
    if (!COMPONENT_PROP_KEY.test(key)) {
      issues.push(`"${key}": key must be kebab-case (a-z, 0-9, hyphens)`);
      continue;
    }
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      issues.push(`"${key}": must be a JSON Schema property object`);
      continue;
    }
    const f = e as Record<string, unknown>;
    const label = typeof f.title === 'string' && f.title.trim() ? f.title.trim() : key;
    if (/[<>]/.test(label)) {
      issues.push(`"${key}": title must not contain < or >`);
      continue;
    }
    const type: ComponentPropType | null = Array.isArray(f.enum)
      ? 'select'
      : f.type === 'boolean' ? 'boolean'
        : f.type === 'number' || f.type === 'integer' ? 'number'
          : f.type === 'string' && f.format === 'color' ? 'color'
            : f.type === 'string' && f.format === 'font' ? 'font'
              : null;
    if (!type) {
      issues.push(f.type === 'string'
        ? `"${key}": a plain string is not a property — text is edited through data-edit; use format "color" or "font", or an enum`
        : `"${key}": type must be boolean | number | string with format color/font | string with enum`);
      continue;
    }
    const spec: ComponentPropSpec = { key, type, label, default: '' };
    let ok = true;
    switch (type) {
      case 'color': {
        if (typeof f.default !== 'string' || !COLOR_VALUE.test(f.default.trim())) {
          issues.push(`"${key}": color default must be #rgb, #rrggbb, #rrggbbaa or var(--token)`);
          ok = false;
          break;
        }
        spec.default = f.default.trim();
        break;
      }
      case 'font': {
        if (typeof f.default !== 'string' || f.default === 'preset' || !isDisplayTextFontId(f.default)) {
          issues.push(`"${key}": font default must be a font id: sans | serif | mono | web:<library id> | google:<Family>`);
          ok = false;
          break;
        }
        spec.default = f.default;
        break;
      }
      case 'number': {
        if (!isFiniteNumber(f.default)) {
          issues.push(`"${key}": number default must be a finite number`);
          ok = false;
          break;
        }
        const min = isFiniteNumber(f.minimum) ? f.minimum : undefined;
        const max = isFiniteNumber(f.maximum) ? f.maximum : undefined;
        const step = isFiniteNumber(f.multipleOf) && f.multipleOf > 0 ? f.multipleOf : undefined;
        if (min !== undefined && max !== undefined && min > max) {
          issues.push(`"${key}": minimum must not exceed maximum`);
          ok = false;
          break;
        }
        if ((min !== undefined && f.default < min) || (max !== undefined && f.default > max)) {
          issues.push(`"${key}": default must sit within minimum…maximum`);
          ok = false;
          break;
        }
        spec.default = f.default;
        if (min !== undefined) spec.min = min;
        if (max !== undefined) spec.max = max;
        if (step !== undefined) spec.step = step;
        break;
      }
      case 'boolean': {
        if (typeof f.default !== 'boolean') {
          issues.push(`"${key}": boolean default must be true or false`);
          ok = false;
          break;
        }
        spec.default = f.default;
        break;
      }
      case 'select': {
        const options = (f.enum as unknown[]).filter((o): o is string => typeof o === 'string' && OPTION_TOKEN.test(o));
        if (!options.length || options.length !== (f.enum as unknown[]).length) {
          issues.push(`"${key}": enum members must be lowercase tokens (a-z, 0-9, hyphens)`);
          ok = false;
          break;
        }
        if (typeof f.default !== 'string' || !options.includes(f.default)) {
          issues.push(`"${key}": default must be one of the enum members`);
          ok = false;
          break;
        }
        spec.default = f.default;
        spec.options = [...new Set(options)];
        break;
      }
    }
    if (!ok) continue;
    specs.push(spec);
  }
  return issues.length ? { specs: [], issues } : { specs, issues };
}

function coerce(spec: ComponentPropSpec, value: unknown): ComponentPropValue {
  switch (spec.type) {
    case 'color':
      return typeof value === 'string' && COLOR_VALUE.test(value.trim()) ? value.trim() : spec.default;
    case 'number': {
      const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(num)) return spec.default;
      let out = num;
      if (spec.min !== undefined) out = Math.max(spec.min, out);
      if (spec.max !== undefined) out = Math.min(spec.max, out);
      return out;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return spec.default;
    case 'select':
      return typeof value === 'string' && spec.options?.includes(value) ? value : spec.default;
    case 'font':
      return typeof value === 'string' && value !== 'preset' && isDisplayTextFontId(value) ? value : spec.default;
  }
}

/** Effective value of every declared property: override when valid, else the default. Unknown
 *  override keys are dropped, wrong types fall back, numbers clamp — this never throws. */
export function resolveComponentProps(specs: readonly ComponentPropSpec[], overrides: unknown): Record<string, ComponentPropValue> {
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? (overrides as Record<string, unknown>) : {};
  const out: Record<string, ComponentPropValue> = {};
  for (const spec of specs) out[spec.key] = spec.key in source ? coerce(spec, source[spec.key]) : spec.default;
  return out;
}

/** Overrides worth persisting: only keys the current schema declares, coerced, and only where
 *  they differ from the default. Empty result means "delete slots.props". */
export function pruneComponentProps(schemaJson: string | undefined, overrides: unknown): ComponentPropsOverrides | undefined {
  const { specs } = parseComponentProps(schemaJson);
  if (!specs.length) return undefined;
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? (overrides as Record<string, unknown>) : {};
  const out: ComponentPropsOverrides = {};
  for (const spec of specs) {
    if (!(spec.key in source)) continue;
    const value = coerce(spec, source[spec.key]);
    if (value !== spec.default) out[spec.key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** `{ props }` to spread into the slots of a rewritten component so the user's tuned values survive
 *  a regeneration that kept the keys — or `{}` when nothing applies to the new schema. */
export function componentPropsCarry(schemaJson: string | undefined, overrides: unknown): { props: ComponentPropsOverrides } | Record<string, never> {
  const props = pruneComponentProps(schemaJson, overrides);
  return props ? { props } : {};
}

const cssValue = (spec: ComponentPropSpec, value: ComponentPropValue): string => (spec.type === 'number' ? n(Number(value)) : String(value));
/** What `--p-<key>` holds: a font id becomes its CSS family stack; everything else is the value itself. */
const varValue = (spec: ComponentPropSpec, value: ComponentPropValue): string =>
  (spec.type === 'font' ? displayTextFontCss(String(value)) ?? 'inherit' : cssValue(spec, value));
const IN_VARS: ReadonlySet<ComponentPropType> = new Set(['color', 'number', 'font']);

/** `--p-<key>:<v>;` for colour and number properties — the inline declarations on the container. */
export function componentPropsInlineCss(specs: readonly ComponentPropSpec[], values: Record<string, ComponentPropValue>): string {
  return specs
    .filter((spec) => IN_VARS.has(spec.type))
    .map((spec) => `--p-${spec.key}:${escapeAttr(varValue(spec, values[spec.key] ?? spec.default))};`)
    .join('');
}

/** `data-p-<key>="<v>"` for every property (booleans as "true"/"false"), so attribute selectors work. */
export function componentPropsAttrs(specs: readonly ComponentPropSpec[], values: Record<string, ComponentPropValue>): string {
  return specs.map((spec) => `data-p-${spec.key}="${escapeAttr(cssValue(spec, values[spec.key] ?? spec.default))}"`).join(' ');
}

/** What the live preview channel writes on the container: the same formatting as the assembler. */
export function componentPropsLiveMessage(specs: readonly ComponentPropSpec[], values: Record<string, ComponentPropValue>): {
  vars: Record<string, string>;
  attrs: Record<string, string>;
} {
  const vars: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  for (const spec of specs) {
    const value = values[spec.key] ?? spec.default;
    if (IN_VARS.has(spec.type)) vars[`--p-${spec.key}`] = varValue(spec, value);
    attrs[`data-p-${spec.key}`] = cssValue(spec, value);
  }
  return { vars, attrs };
}

/** Read-back shape for agents and for the brief: one row per declared property with its effective value. */
export function componentPropsView(specs: readonly ComponentPropSpec[], values: Record<string, ComponentPropValue>): Array<{ key: string; type: ComponentPropType; value: ComponentPropValue }> {
  return specs.map((spec) => ({ key: spec.key, type: spec.type, value: values[spec.key] ?? spec.default }));
}

/** JSON Schema (draft 2020-12) in the shapes the props form already renders: format:'color', enum,
 *  minimum/maximum/multipleOf, title = the declared label, default. */
export function componentPropsJsonSchema(specs: readonly ComponentPropSpec[]): {
  type: 'object';
  additionalProperties: false;
  properties: Record<string, Record<string, unknown>>;
  required: string[];
} {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const spec of specs) {
    const base = { title: spec.label, default: spec.default };
    switch (spec.type) {
      case 'color': properties[spec.key] = { type: 'string', format: 'color', ...base }; break;
      case 'number': properties[spec.key] = {
        type: 'number', ...base,
        ...(spec.min !== undefined ? { minimum: spec.min } : {}),
        ...(spec.max !== undefined ? { maximum: spec.max } : {}),
        ...(spec.step !== undefined ? { multipleOf: spec.step } : {}),
      }; break;
      case 'boolean': properties[spec.key] = { type: 'boolean', ...base }; break;
      case 'select': properties[spec.key] = { type: 'string', enum: spec.options ?? [], ...base }; break;
      case 'font': properties[spec.key] = { type: 'string', format: 'font', ...base }; break;
    }
  }
  return { type: 'object', additionalProperties: false, properties, required: [] };
}

/** How the markup uses its schema. `unused` keys are never read (soft lint). `ownDeclarations` are
 *  `--p-*:` declarations or `data-p-*=` attributes the model wrote itself: a value set on a descendant
 *  shadows the container's inherited one and silently defeats overrides and the live channel (hard lint).
 *  Attribute SELECTORS (`[data-p-key="v"]`) are the intended use and are not flagged. */
export function componentPropsUsage(innerHtml: string, specs: readonly ComponentPropSpec[]): { unused: string[]; ownDeclarations: string[] } {
  const unused = specs
    .filter((spec) => !new RegExp(`var\\(\\s*--p-${spec.key}\\s*[,)]`).test(innerHtml) && !new RegExp(`\\[\\s*data-p-${spec.key}\\b`).test(innerHtml))
    .map((spec) => spec.key);
  const ownDeclarations = [
    ...[...innerHtml.matchAll(/--p-([a-z0-9-]+)\s*:/g)].map((m) => `--p-${m[1]}`),
    ...[...innerHtml.matchAll(/(?:^|[\s"'])(data-p-[a-z0-9-]+)\s*=/g)].map((m) => m[1]!),
  ];
  return { unused, ownDeclarations: [...new Set(ownDeclarations)] };
}

/** Rewrite the schema defaults to the given effective values (save-as-element bakes the tuned look
 *  into the library copy). Returns the baked schema string, or the input unchanged when it declares
 *  no valid properties. */
export function bakeComponentPropsDefaults(schemaJson: string | undefined, values: Record<string, ComponentPropValue>): string | undefined {
  const { specs } = parseComponentProps(schemaJson);
  if (!specs.length) return schemaJson;
  const baked = componentPropsJsonSchema(specs.map((spec) => ({ ...spec, default: spec.key in values ? coerce(spec, values[spec.key]) : spec.default }))).properties;
  return JSON.stringify(baked);
}

/** Font ids a bespoke component's font-type properties resolve to (effective values), so the
 *  document, the parent page and the export load their stylesheets like any other font in use. */
export function componentPropsFontIds(block: { templateId: string; slots: Record<string, unknown> }): string[] {
  if (block.templateId !== 'custom') return [];
  const specs = parseComponentProps(blockPropsSchema(block)).specs.filter((spec) => spec.type === 'font');
  if (!specs.length) return [];
  const values = resolveComponentProps(specs, block.slots.props);
  return specs.map((spec) => String(values[spec.key]));
}

/** The generation contract's floor, checked by the lint gate when `requireProps` is on: a bespoke
 *  component must declare editable properties, and at least one of them a colour. */
export function componentPropsRequirement(schemaJson: string | undefined): string | null {
  if (!hasComponentPropsManifest(schemaJson)) return 'a bespoke component must declare editable properties as a ```json fence — {"<key>":{"type":…,"default":…}} (JSON Schema properties, the vocabulary registered components use) — with at least one color property (the accent), plus the number / boolean / enum / font values a user would tune';
  const { specs, issues } = parseComponentProps(schemaJson);
  if (issues.length) return null; // reported as props-invalid already
  if (!specs.some((spec) => spec.type === 'color')) return 'the properties schema must include at least one color property (the accent colour the user is most likely to change)';
  return null;
}

/** Text slots: every `data-edit` element with its current text, in document order — the "text
 *  properties" of the inspector. Editing writes back through the editor's data-edit path. */
export function dataEditFields(innerHtml: string): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  const seen = new Set<string>();
  for (const m of innerHtml.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\sdata-edit\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const key = (m[2] ?? m[3] ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: (m[4] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** Image slots: every `<img>` (not a media-block body) with its src and alt, indexed in document order —
 *  the same index the editor's click-to-replace path uses. */
export function imageSlots(innerHtml: string): Array<{ index: number; src: string; alt: string }> {
  const out: Array<{ index: number; src: string; alt: string }> = [];
  let index = 0;
  for (const m of innerHtml.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
    const src = attr('src'); const alt = attr('alt');
    if (!/\bclass\s*=\s*["'][^"']*\bhf-media\b/i.test(tag)) out.push({ index, src: (src?.[1] ?? src?.[2] ?? '').trim(), alt: (alt?.[1] ?? alt?.[2] ?? '').trim() });
    index += 1;
  }
  return out;
}
