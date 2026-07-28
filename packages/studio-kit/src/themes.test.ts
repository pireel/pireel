import { describe, expect, it } from 'vitest';
import { components, render, themes, themeVars, type ComponentId } from './index';

const CTX = { box: { w: 900, h: 500 }, canvas: { w: 1080, h: 1920 }, durationSec: 4 };

describe.each(Object.entries(themes))('theme %s', (id, theme) => {
  it('declares an id, a title and a voice a model can act on', () => {
    expect(theme.id).toBe(id);
    expect(theme.title.length).toBeGreaterThan(1);
    // Prose alone drifts and directives alone read as a checklist — both parts are the convention
    expect(theme.voice.length).toBeGreaterThan(80);
    expect(theme.voice).toContain('- ');
  });

  it('emits palette tokens the components actually read', () => {
    const vars = themeVars(theme.palette);
    for (const decl of vars.split(';').filter(Boolean)) expect(decl.startsWith('--sk-')).toBe(true);
  });

  it.each((theme.blueprints ?? []).map((b) => [b.id, b] as const))('blueprint %s renders', (_id, bp) => {
    expect(Object.keys(components)).toContain(bp.component);
    const props = components[bp.component as ComponentId].defaults;
    const { html, timeline } = render(bp.component, 'tb', props, { ...CTX, blueprint: bp });
    expect(html).toContain('#tb'); // scoped
    expect(html).not.toMatch(/<script/i);
    // every rule scoped to the block, including ones the blueprint wrote bare
    const css = html.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
    for (const chunk of css.split('}')) {
      const sel = chunk.split('{')[0]?.trim();
      if (sel) expect(sel.startsWith('#tb'), `leaked: ${sel}`).toBe(true);
    }
    // motion, where declared, only targets this block
    for (const m of timeline.matchAll(/tl\.(?:from|to)\('([^']+)'/g)) expect(m[1]!.startsWith('#tb')).toBe(true);
  });
});
