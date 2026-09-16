import { V3_TOOL_SCHEMAS } from './schemas';

/**
 * Context-free input validation against the published tool schemas, run by the server before a
 * call is handed to the live tab. The adapter's own checks run wherever the call executes — for
 * document edits that is the browser, whose bundle is only as new as the page load — so a value
 * the schema already forbids (an effect not in the enum, an object where a [from, to] pair is
 * expected) must be refused here, with the same receipt shape, regardless of which code the tab is
 * running. Only what the schema states is checked: types, enums, required fields and fixed-length
 * pairs. Bounds, ids and anything that needs the document stay with the adapter.
 */

export interface V3InputProblem {
  status: 'error';
  error: 'invalid_value' | 'missing_field' | 'invalid_shape';
  path: string;
  value?: unknown;
  allowed?: readonly string[];
  fix: string;
}

type Schema = Record<string, unknown>;

const describe = (schema: Schema): string => {
  if (Array.isArray(schema.enum)) return `one of ${(schema.enum as string[]).join(' / ')}`;
  if (schema.type === 'array') {
    const items = (schema.items ?? {}) as Schema;
    if (schema.minItems === 2 && schema.maxItems === 2) return `a two-${String(items.type ?? 'value')} array [from, to]`;
    return `an array of ${items.type === 'object' ? 'objects' : `${String(items.type ?? 'value')}s`}`;
  }
  if (schema.type === 'object') return 'an object';
  return String(schema.type ?? 'value');
};

const problem = (error: V3InputProblem['error'], path: string, schema: Schema, value: unknown): V3InputProblem => ({
  status: 'error',
  error,
  path,
  ...(error === 'missing_field' ? {} : { value }),
  ...(Array.isArray(schema.enum) ? { allowed: schema.enum as string[] } : {}),
  fix: error === 'missing_field'
    ? `${path} is required.`
    : `${path} must be ${describe(schema)}${Array.isArray(schema.enum) ? '' : `; got ${Array.isArray(value) ? 'an array' : value === null ? 'null' : typeof value}`}.`,
});

function check(schema: Schema, value: unknown, path: string): V3InputProblem | null {
  if (value === undefined) return null;
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as Schema[]).some((branch) => check(branch, value, path) === null)
      ? null
      : problem('invalid_value', path, schema, value);
  }
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return problem('invalid_shape', path, schema, value);
      const record = value as Record<string, unknown>;
      for (const key of (schema.required as string[] | undefined) ?? []) {
        if (record[key] === undefined) return problem('missing_field', path === '' ? key : `${path}.${key}`, schema, undefined);
      }
      for (const [key, child] of Object.entries((schema.properties as Record<string, Schema> | undefined) ?? {})) {
        const found = check(child, record[key], path === '' ? key : `${path}.${key}`);
        if (found) return found;
      }
      return null;
    }
    case 'array': {
      if (!Array.isArray(value)) return problem('invalid_shape', path, schema, value);
      if (typeof schema.minItems === 'number' && schema.minItems === schema.maxItems && value.length !== schema.minItems) {
        return problem('invalid_shape', path, schema, value);
      }
      const items = schema.items as Schema | undefined;
      if (!items) return null;
      for (const [index, entry] of value.entries()) {
        const found = check(items, entry, `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }
    case 'string':
      if (typeof value !== 'string') return problem('invalid_value', path, schema, value);
      if (Array.isArray(schema.enum) && !(schema.enum as string[]).includes(value)) return problem('invalid_value', path, schema, value);
      return null;
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) ? null : problem('invalid_value', path, schema, value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : problem('invalid_value', path, schema, value);
    case 'boolean':
      return typeof value === 'boolean' ? null : problem('invalid_value', path, schema, value);
    default:
      return null;
  }
}

/** Null when the input fits the tool's schema; unknown tools and unknown fields pass. */
export function validateV3Input(tool: string, args: Record<string, unknown>): V3InputProblem | null {
  const schema = V3_TOOL_SCHEMAS[tool]?.inputSchema;
  if (!schema) return null;
  return check(schema as Schema, args ?? {}, '');
}
