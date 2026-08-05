import type { Block } from '@pireel/studio-engine/composition';
import { kitComponents } from '@pireel/studio-engine/kit-templates';

export interface ComponentSyncItem {
  index: number;
  text: string;
}

interface JsonSchema {
  type?: string;
  enum?: unknown[];
  format?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

interface KitDefinition {
  jsonSchema: JsonSchema;
  defaults: Record<string, unknown>;
  parse?: (props: unknown) => Record<string, unknown>;
}

interface SyncField extends ComponentSyncItem {
  path: Array<string | number>;
  kind: 'string' | 'number';
}

export interface ComponentContentSyncTarget {
  items: ComponentSyncItem[];
  apply: (items: ComponentSyncItem[]) => Record<string, unknown>;
}

const definitions = kitComponents as Record<string, KitDefinition>;

function isContentLeaf(schema: JsonSchema, nested: boolean): schema is JsonSchema & { type: 'string' | 'number' } {
  if (schema.type === 'string') return !schema.enum && schema.format !== 'color';
  // Top-level numbers in the kit are presentation controls (for example chart.highlight).
  // Numbers inside row arrays are authored data values and belong to narration content.
  return nested && schema.type === 'number';
}

function collectFields(
  schema: JsonSchema,
  value: unknown,
  path: Array<string | number>,
  nested: boolean,
  fields: SyncField[],
): void {
  if (isContentLeaf(schema, nested)) {
    const text = value == null ? '' : String(value).trim();
    if (text) fields.push({ index: fields.length, text, path, kind: schema.type });
    return;
  }
  if (schema.type !== 'array' || !Array.isArray(value) || schema.items?.type !== 'object') return;
  const rowProps = schema.items.properties ?? {};
  value.forEach((row, rowIndex) => {
    if (!row || typeof row !== 'object') return;
    for (const [key, child] of Object.entries(rowProps)) {
      collectFields(child, (row as Record<string, unknown>)[key], [...path, rowIndex, key], true, fields);
    }
  });
}

function setAtPath(root: Record<string, unknown>, path: Array<string | number>, value: unknown): void {
  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (!cursor || typeof cursor !== 'object') return;
    cursor = (cursor as Record<string | number, unknown>)[path[i]!];
  }
  if (!cursor || typeof cursor !== 'object') return;
  (cursor as Record<string | number, unknown>)[path[path.length - 1]!] = value;
}

/** Schema-driven adapter for props-based kit blocks; presentation props never enter narration sync. */
export function componentContentSyncTarget(block: Block): ComponentContentSyncTarget | null {
  if (!block.templateId.startsWith('kit:')) return null;
  const component = block.templateId.slice('kit:'.length);
  const definition = definitions[component];
  if (!definition) return null;
  const raw = (block.slots as { props?: unknown }).props;
  const props = definition.parse ? definition.parse(raw) : { ...definition.defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
  const fields: SyncField[] = [];
  for (const [key, schema] of Object.entries(definition.jsonSchema.properties ?? {})) {
    collectFields(schema, props[key], [key], false, fields);
  }
  if (!fields.length) return null;

  return {
    items: fields.map(({ index, text }) => ({ index, text })),
    apply(items) {
      const rewritten = JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
      const byIndex = new Map(items.map((item) => [item.index, item.text]));
      for (const field of fields) {
        const text = byIndex.get(field.index)?.trim();
        if (!text) continue;
        const value = field.kind === 'number' ? Number(text) : text;
        if (field.kind === 'number' && !Number.isFinite(value)) continue;
        setAtPath(rewritten, field.path, value);
      }
      return definition.parse ? definition.parse(rewritten) : rewritten;
    },
  };
}

/** One capability gate for both authored HTML components and props-driven kit components. */
export function isBlockContentSyncable(block: Block): boolean {
  if (block.templateId === 'custom') {
    const html = (block.slots as { innerHtml?: unknown }).innerHtml;
    return typeof html === 'string' && html.includes('data-edit');
  }
  return componentContentSyncTarget(block) !== null;
}
