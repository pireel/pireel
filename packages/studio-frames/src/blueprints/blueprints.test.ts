/**
 * Theme stagings: the guarantees the format promises, checked against the real ones.
 * A staging that leaks styles or hard-codes type would look fine in the box it was drawn for and
 * wrong everywhere else — exactly the failure the blueprint format exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@pireel/studio-kit';
import { FRAME_BLUEPRINTS } from './index';
import { frameBlueprints, getBlueprint } from '@pireel/studio-engine/blueprint-registry';

const ALL = Object.values(FRAME_BLUEPRINTS).flat();
const SAMPLE: Record<string, Record<string, unknown>> = {
  metric: { value: '47%', label: 'repeat purchase', note: 'up from 38% last quarter' },
  callout: { text: 'Ship the boring version first', support: 'week 3 retro' },
  steps: { items: [{ text: 'Write it down', note: 'one line' }, { text: 'Cut it in half' }, { text: 'Ship' }] },
};
const ctx = (w: number, h: number) => ({ box: { w, h }, canvas: { w: 1080, h: 1920 }, lang: 'en' });

describe('frame stagings', () => {
  it('register under their frame and resolve by id', () => {
    expect(frameBlueprints('memphis-pop').length).toBeGreaterThan(0);
    expect(frameBlueprints('scrapbook-tape').length).toBeGreaterThan(0);
    for (const b of ALL) expect(getBlueprint(b.id)).toBe(b);
    expect(getBlueprint('nope/gone')).toBeUndefined();
  });

  it('ids are namespaced by frame and unique', () => {
    const seen = new Set<string>();
    for (const [frameId, list] of Object.entries(FRAME_BLUEPRINTS)) {
      for (const b of list) {
        expect(b.id.startsWith(`${frameId}/`), `${b.id} is not namespaced`).toBe(true);
        expect(seen.has(b.id), `${b.id} duplicated`).toBe(false);
        seen.add(b.id);
      }
    }
  });

  it('every rule is scoped to the block — no staging can style the document', () => {
    for (const b of ALL) {
      const { html } = render(b.component, 'blk1', SAMPLE[b.component] ?? {}, { ...ctx(900, 560), blueprint: b });
      const css = html.slice(html.indexOf('<style>') + '<style>'.length, html.lastIndexOf('</style>'));
      for (const rule of css.split('}').slice(0, -1)) {
        const sel = rule.split('{')[0]!.trim();
        if (!sel) continue;
        for (const one of sel.split(',')) expect(one.trim().startsWith('#blk1'), `${b.id}: unscoped "${one.trim()}"`).toBe(true);
      }
    }
  });

  it('type adapts to the box — the same staging is not drawn at one fixed size', () => {
    for (const b of ALL) {
      const big = render(b.component, 'k', SAMPLE[b.component] ?? {}, { ...ctx(1000, 700), blueprint: b }).html;
      const small = render(b.component, 'k', SAMPLE[b.component] ?? {}, { ...ctx(340, 200), blueprint: b }).html;
      expect(big, `${b.id} ignores the box`).not.toBe(small);
    }
  });

  it('renders without a surface underneath — the staging paints its own', () => {
    const b = FRAME_BLUEPRINTS['memphis-pop']![0]!;
    const { html } = render(b.component, 'k', { ...SAMPLE.metric, surface: 'card', surfaceColor: '#ff0000' }, { ...ctx(900, 560), blueprint: b });
    expect(html).not.toContain('#ff0000');
  });

  it('declared motion becomes a timeline', () => {
    for (const b of ALL) {
      const { timeline } = render(b.component, 'k', SAMPLE[b.component] ?? {}, { ...ctx(900, 560), blueprint: b });
      expect(timeline.length, `${b.id} has no motion`).toBeGreaterThan(0);
      expect(timeline).toContain('#k ');
    }
  });

  it('an unknown staging degrades to the built-in variant instead of failing', () => {
    expect(() => render('metric', 'k', SAMPLE.metric, ctx(900, 560))).not.toThrow();
  });
});
