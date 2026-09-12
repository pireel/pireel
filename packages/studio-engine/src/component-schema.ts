import { isComponentPropertyRows, isComponentPropertyScalar } from './component-property-input';
/**
 * ONE property contract for every component on the timeline.
 *
 * A registered (kit) component declares JSON Schema in code; a bespoke component declares the same
 * JSON Schema `properties` in its `slots.propsSchema` (the ```json fence). Everything downstream —
 * the inspector form, the agent's set_block_props, the get_state read-back, the brief — consumes only
 * the view this module returns: `{ schema, values }` plus one `applyComponentValues` that knows where
 * each kind persists its values (kit: the full props object, parsed by the component; bespoke:
 * overrides pruned against the schema). Adding a component of either kind costs no UI or tool work.
 */
import { kitComponents } from './kit-templates';
import { blockPropsSchema, componentPropsJsonSchema, parseComponentProps, pruneComponentProps, resolveComponentProps } from './component-props';

export interface ComponentSchemaView {
  source: 'kit' | 'manifest';
  /** JSON Schema (draft 2020-12) object schema: `properties` in the shared field vocabulary. */
  schema: { type?: string; properties?: Record<string, Record<string, unknown>>; required?: string[] };
  /** Effective values: defaults with the stored values applied. */
  values: Record<string, unknown>;
}

export type ComponentValueType = 'color' | 'font' | 'select' | 'number' | 'boolean' | 'text' | 'rows';

type BlockLike = { templateId: string; slots: Record<string, unknown> };
type KitDef = { jsonSchema: Record<string, unknown>; defaults: Record<string, unknown>; parse?: (props: unknown) => Record<string, unknown> };

function kitDefinition(templateId: string): KitDef | null {
  if (!templateId.startsWith('kit:')) return null;
  return (kitComponents as Record<string, KitDef>)[templateId.slice(4)] ?? null;
}

function storedProps(block: BlockLike): Record<string, unknown> {
  const props = block.slots.props;
  return props && typeof props === 'object' && !Array.isArray(props) ? (props as Record<string, unknown>) : {};
}

/** The editable surface of a block, or null when it has none (media, captions, a bespoke component without a properties schema). */
export function componentSchemaOf(block: BlockLike): ComponentSchemaView | null {
  const kit = kitDefinition(block.templateId);
  if (kit) return { source: 'kit', schema: kit.jsonSchema as ComponentSchemaView['schema'], values: { ...kit.defaults, ...storedProps(block) } };
  if (block.templateId !== 'custom') return null;
  const specs = parseComponentProps(blockPropsSchema(block)).specs;
  if (!specs.length) return null;
  return { source: 'manifest', schema: componentPropsJsonSchema(specs), values: resolveComponentProps(specs, block.slots.props) };
}

/** Slots after the user or an agent set the component's values to `next` (full or partial); null when
 *  the block has no editable surface. Kit: the component parses the merged object with its own
 *  coercion. Bespoke: overrides pruned to the manifest and to values that differ from the default. */
export function applyComponentValues(block: BlockLike, next: Record<string, unknown>): Record<string, unknown> | null {
  const view = componentSchemaOf(block);
  if (!view) return null;
  const { props: _previous, ...rest } = block.slots;
  if (view.source === 'kit') {
    const kit = kitDefinition(block.templateId)!;
    const merged = { ...view.values, ...next };
    return { ...rest, props: kit.parse ? kit.parse(merged) : merged };
  }
  const props = pruneComponentProps(blockPropsSchema(block), { ...view.values, ...next });
  return props ? { ...rest, props } : rest;
}

function typeOf(field: Record<string, unknown>): ComponentValueType {
  if (Array.isArray(field.enum)) return 'select';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'number' || field.type === 'integer') return 'number';
  if (field.type === 'array') return 'rows';
  if (field.format === 'color') return 'color';
  if (field.format === 'font') return 'font';
  return 'text';
}

/** Read-back rows for agents: key, type in the shared vocabulary, effective value. */
export function componentValuesView(view: ComponentSchemaView): Array<{ key: string; type: ComponentValueType; value: unknown }> {
  return Object.entries(view.schema.properties ?? {}).map(([key, field]) => ({ key, type: typeOf(field), value: view.values[key] }));
}

/** `{ props: { schema, values } }` for get_block / compose_context read-back, or `{}` when the block has no editable surface. */
export function blockPropsReadback(block: BlockLike): { props?: { schema: ComponentSchemaView['schema']; values: ReturnType<typeof componentValuesView> } } {
  const view = componentSchemaOf(block);
  return view ? { props: { schema: view.schema, values: componentValuesView(view) } } : {};
}

/** Validate transport shapes before the existing component parser normalizes declared values. */
export function componentPropertyInputError(view: ComponentSchemaView, requested: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(requested)) {
    const field = view.schema.properties?.[key];
    if (view.source === 'kit' && field?.type === 'array') {
      if (!isComponentPropertyRows(value)) return `invalid property ${key}: expected bounded rows of scalar fields`;
    } else if (!isComponentPropertyScalar(value)) {
      return `invalid property ${key}: expected a string, finite number or boolean`;
    }
  }
  return null;
}
