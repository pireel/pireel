import { describe, expect, it } from 'vitest';
import { CAPTION_PRESETS } from '../caption-presets';
import { CUT_TRANSITION_EFFECTS, PLACE_ANCHORS, SHOT_TREATMENTS } from '../composition-core';
import { DISPLAY_TEXT_ANIMATION_IDS, DISPLAY_TEXT_PRESETS } from '../display-text-presets';
import { V3_TOOLS } from './registry';
import { CHARGE_MARKER, V3_TOOL_SCHEMAS } from './schemas';

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Walk a JSON schema and yield every property name with its path. */
function* propertyNames(schema: unknown, path = ''): Generator<[string, string]> {
  if (!schema || typeof schema !== 'object') return;
  const node = schema as Record<string, unknown>;
  const props = node.properties as Record<string, unknown> | undefined;
  if (props) for (const [key, value] of Object.entries(props)) { yield [key, `${path}.${key}`]; yield* propertyNames(value, `${path}.${key}`); }
  if (node.items) yield* propertyNames(node.items, `${path}[]`);
}
function* objectNodes(schema: unknown): Generator<Record<string, unknown>> {
  if (!schema || typeof schema !== 'object') return;
  const node = schema as Record<string, unknown>;
  if (node.type === 'object') yield node;
  for (const value of Object.values((node.properties as Record<string, unknown>) ?? {})) yield* objectNodes(value);
  if (node.items) yield* objectNodes(node.items);
}
function findEnum(schema: unknown, key: string): unknown[] | undefined {
  for (const [name, path] of propertyNames(schema)) {
    if (name !== key) continue;
    const node = path.split('.').slice(1).reduce<unknown>((cursor, seg) => {
      const clean = seg.replace('[]', '');
      const c = cursor as Record<string, unknown>;
      const next = (c.properties as Record<string, unknown>)?.[clean] ?? c;
      return seg.endsWith('[]') ? (next as Record<string, unknown>).items : next;
    }, schema) as Record<string, unknown>;
    if (Array.isArray(node?.enum)) return node.enum as unknown[];
  }
  return undefined;
}

describe('agent surface v3 schemas', () => {
  it('every registered tool has a description and schema, and nothing else does', () => {
    const ids = V3_TOOLS.map((tool) => tool.id).sort();
    expect(Object.keys(V3_TOOL_SCHEMAS).sort()).toEqual(ids);
  });

  it('descriptions stay within the budget and speak the v3 vocabulary', () => {
    for (const tool of V3_TOOLS) {
      const { description } = V3_TOOL_SCHEMAS[tool.id]!;
      const count = words(description);
      expect(count, `${tool.id}: ${count} words`).toBeGreaterThanOrEqual(25);
      expect(count, `${tool.id}: ${count} words`).toBeLessThanOrEqual(300);
      expect(description, `${tool.id} mentions shots/blocks`).not.toMatch(/\bshots?\b|\bblocks?\b/i);
      expect(description.includes(CHARGE_MARKER), `${tool.id} charge marker`).toBe(Boolean(tool.charges));
    }
  });

  it('timeline positions are frames: no seconds-based timeline fields and no legacy ids', () => {
    const forbidden = new Set(['atSec', 'startSec', 'toSec', 'fromSec', 'shotId', 'blockId', 'shotIds', 'blockIds', 'fadeInSec', 'fadeOutSec']);
    const allowed: Record<string, string[]> = {
      apply_layout: ['blockIds', 'shotId'], // legacy graphic-layout tool kept verbatim until the engine gains a clip-id layout API
      set_keyframes: ['atSec'], // clip-relative seconds by engine contract
      get_beat_grid: ['startSec'], // source-second range on the music asset, not a timeline position
    };
    for (const tool of V3_TOOLS) {
      for (const [name, path] of propertyNames(V3_TOOL_SCHEMAS[tool.id]!.inputSchema)) {
        if (forbidden.has(name) && !(allowed[tool.id] ?? []).includes(name)) throw new Error(`${tool.id}${path} uses legacy field ${name}`);
      }
    }
  });

  it('every object rejects unknown fields', () => {
    for (const tool of V3_TOOLS) {
      for (const node of objectNodes(V3_TOOL_SCHEMAS[tool.id]!.inputSchema)) {
        expect(node.additionalProperties, `${tool.id} object without additionalProperties:false`).toBe(false);
      }
    }
  });

  it('enums are derived from engine constants', () => {
    expect(findEnum(V3_TOOL_SCHEMAS.set_clip_framing!.inputSchema, 'treatment')).toEqual(SHOT_TREATMENTS.map((entry) => entry.id));
    expect(findEnum(V3_TOOL_SCHEMAS.set_clip_framing!.inputSchema, 'anchor')).toEqual([...PLACE_ANCHORS]);
    expect(findEnum(V3_TOOL_SCHEMAS.add_transition!.inputSchema, 'effect')).toEqual([...CUT_TRANSITION_EFFECTS.map((entry) => entry.id), 'none']);
    expect(findEnum(V3_TOOL_SCHEMAS.set_captions!.inputSchema, 'preset')).toEqual(CAPTION_PRESETS.map((preset) => preset.id));
    expect(findEnum(V3_TOOL_SCHEMAS.set_texts!.inputSchema, 'preset')).toEqual(DISPLAY_TEXT_PRESETS.map((preset) => preset.id));
    expect(findEnum(V3_TOOL_SCHEMAS.set_texts!.inputSchema, 'animation')).toEqual([...DISPLAY_TEXT_ANIMATION_IDS]);
  });
});
