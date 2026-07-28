/**
 * The catalogue is what a model reads; the schema is what the parser enforces. These pin the
 * two together, so a component or a field can never exist in one and not the other.
 */

import { describe, expect, it } from 'vitest';
import { catalogText, surfaceText } from './catalog';
import { components } from './index';
import { SURFACE_FIELDS } from './surface';

const text = catalogText(components);

describe('catalogue', () => {
  it('lists every registered component with its summary', () => {
    for (const [id, def] of Object.entries(components)) {
      expect(text).toContain(`  ${id} — ${def.summary}`);
    }
  });

  it('lists every non-surface prop of every component', () => {
    for (const [id, def] of Object.entries(components)) {
      const props = Object.keys((def.jsonSchema as { properties: Record<string, unknown> }).properties);
      for (const p of props) {
        if (p in SURFACE_FIELDS) continue;
        expect(text, `${id}.${p} missing from the catalogue`).toContain(`    ${p}: `);
      }
    }
  });

  it('describes surface props once, not per component', () => {
    // The count is what matters: eight components must not repeat five surface lines each.
    expect(text).not.toContain('surfaceColor');
    expect(surfaceText()).toContain('surfaceColor');
  });

  it('carries enum members and their defaults', () => {
    expect(text).toContain('variant: hero-number | split-editorial | badge — default hero-number');
    expect(text).toContain('trend: up | down | none — default none');
  });

  it('carries length caps, so the model knows what will fit', () => {
    expect(text).toContain('value: text ≤16 (required)');
    expect(text).toContain('title: text ≤24 (required)'); // lowerThird
  });

  it('describes row props inline with their fields', () => {
    expect(text).toContain('cells: up to 4 rows of { label ≤24, value ≤12, trend:up|down|none }');
    expect(text).toContain('series: up to 6 rows of { label ≤16, value }');
  });

  it('carries conditional visibility, so the model does not set dead fields', () => {
    expect(surfaceText()).toContain('(only when surface = card)');
    expect(surfaceText()).toContain('(only when border = hairline/solid)');
  });

  it('every enum member named in the catalogue actually parses', () => {
    // The catalogue promising a variant the parser rejects is the exact drift this guards.
    for (const [id, def] of Object.entries(components)) {
      const props = (def.jsonSchema as { properties: Record<string, { enum?: string[] }> }).properties;
      for (const [name, s] of Object.entries(props)) {
        if (!s.enum) continue;
        for (const member of s.enum) {
          const parsed = def.parse?.({ [name]: member }) as Record<string, unknown> | undefined;
          expect(parsed?.[name], `${id}.${name} = ${member} did not survive parse`).toBe(member);
        }
      }
    }
  });
});
