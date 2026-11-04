import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * editor-product-commands registers skill.set, brand.set, editingSkills.set and handoff.patch when it
 * is imported, and its importers use nothing it exports. Unless package.json lists it as a side
 * effect, production builds drop those imports and every one of these commands fails as
 * invalid-command (development builds keep them, so it only shows after a build).
 */
describe('editor product commands', () => {
  it('are kept by production builds', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { sideEffects: string[] };
    expect(pkg.sideEffects).toEqual(expect.arrayContaining(['**/editor-product-commands.ts', '**/editor-product-commands.js']));
  });
});
