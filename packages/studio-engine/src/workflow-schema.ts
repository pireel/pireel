import type { WorkflowValue } from './workflow';

/** Bounded JSON Schema subset supported by workflow parameters and LLM outputs. */
export interface WorkflowSchema {
  nullable?: boolean;
  title?: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  properties?: Record<string, WorkflowSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: WorkflowSchema;
  enum?: WorkflowValue[];
  minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number;
  minItems?: number; maxItems?: number;
}
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
export function validateWorkflowSchema(schema: WorkflowSchema, depth = 0): void {
  if (depth > 12 || !schema || !['string','number','boolean','null','object','array'].includes(schema.type)) throw new Error('Invalid workflow schema');
  const keys = new Set(['nullable','title','description','type','properties','required','additionalProperties','items','enum','minLength','maxLength','minimum','maximum','minItems','maxItems']);
  if (Object.keys(schema).some(key => !keys.has(key))) throw new Error('Unsupported workflow schema keyword');
  if (schema.nullable !== undefined && typeof schema.nullable !== 'boolean') throw new Error('Invalid nullable schema');
  if (schema.title !== undefined && (typeof schema.title !== 'string' || schema.title.length > 200)) throw new Error('Invalid schema title');
  if (schema.description !== undefined && (typeof schema.description !== 'string' || schema.description.length > 2000)) throw new Error('Invalid schema description');
  for (const key of ['minLength','maxLength','minimum','maximum','minItems','maxItems'] as const) if (schema[key] !== undefined && !Number.isFinite(schema[key])) throw new Error('Invalid schema bound');
  if (schema.enum && (!Array.isArray(schema.enum) || schema.enum.length > 200)) throw new Error('Invalid schema enum');
  if (schema.type === 'array') { if (!schema.items) throw new Error('Array schema requires items'); validateWorkflowSchema(schema.items, depth + 1); }
  if (schema.type === 'object') {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties) || Object.keys(schema.properties).length > 100) throw new Error('Object schema requires bounded properties');
    for (const [key, value] of Object.entries(schema.properties)) { if (unsafe.has(key)) throw new Error('Invalid schema property'); validateWorkflowSchema(value, depth + 1); }
    if (schema.required && (!Array.isArray(schema.required) || schema.required.some(key => !Object.hasOwn(schema.properties!, key)))) throw new Error('Unknown required schema property');
  }
}
export function assertWorkflowValue(value: unknown, schema: WorkflowSchema, path = 'value', depth = 0): asserts value is WorkflowValue {
  if (depth > 20) throw new Error('Workflow data is too deeply nested');
  const fail = (): never => { throw new Error('Invalid workflow value: ' + path); };
  if (value === null && schema.nullable) return;
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) fail();
  if (schema.type === 'null') { if (value !== null) fail(); return; }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return fail();
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 10000)) fail();
    value.forEach((item, index) => assertWorkflowValue(item, schema.items!, `${path}[${index}]`, depth + 1)); return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const record = value as Record<string, unknown>;
    if ((schema.required ?? []).some(key => !Object.hasOwn(record, key))) fail();
    for (const [key, item] of Object.entries(record)) {
      if (unsafe.has(key)) fail();
      const child = schema.properties?.[key];
      if (child) assertWorkflowValue(item, child, path + '.' + key, depth + 1);
      else if (schema.additionalProperties !== true) fail();
    }
    return;
  }
  if (typeof value !== schema.type) fail();
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail();
  if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? 200000))) fail();
}
