import { describe, expect, it } from 'vitest';
import { components, render, type ComponentId, type RenderCtx } from './index';
import { defineSchema, en, num, reqText, rows, text } from './schema';

const CTXS = {
  portraitCard: { box: { w: 900, h: 620 }, canvas: { w: 1080, h: 1920 } },
  landscapeHalf: { box: { w: 860, h: 900 }, canvas: { w: 1920, h: 1080 } },
  tiny: { box: { w: 220, h: 130 }, canvas: { w: 1080, h: 1920 } },
  huge: { box: { w: 1700, h: 1700 }, canvas: { w: 1920, h: 1080 } },
  cjk: { box: { w: 900, h: 620 }, canvas: { w: 1080, h: 1920 }, lang: 'zh' },
} satisfies Record<string, RenderCtx>;

/** Design axes (variant × motion × …) fully crossed, with the SURFACE axes — which are orthogonal
 *  to layout and shared verbatim by every component — sampled instead. Crossing all of them too
 *  multiplied every component's cases by 24 for no extra coverage. */
const SURFACE_AXES = ['surface', 'border', 'radius'];
const SURFACE_SAMPLES: Record<string, string>[] = [
  {},
  { surface: 'none' },
  { surface: 'card', border: 'solid', radius: 'sharp' },
  { surface: 'card', border: 'hairline', radius: 'pill' },
];
function enumCombos(schema: Record<string, unknown>): Record<string, string>[] {
  const props = (schema as { properties: Record<string, { enum?: string[] }> }).properties;
  const axes = Object.entries(props).filter(([k, v]) => Array.isArray(v.enum) && !SURFACE_AXES.includes(k));
  let combos: Record<string, string>[] = [{}];
  for (const [key, v] of axes) {
    combos = combos.flatMap((c) => (v.enum as string[]).map((val) => ({ ...c, [key]: val })));
  }
  const surfaced = Object.keys(props).some((k) => SURFACE_AXES.includes(k));
  return surfaced ? combos.flatMap((c) => SURFACE_SAMPLES.map((sf) => ({ ...c, ...sf }))) : combos;
}

describe('schema primitives', () => {
  const s = defineSchema({
    kind: en(['a', 'b'], 'a'),
    n: num(0, 10, 5),
    t: text(5, 'x'),
    r: reqText(8, 'PLACE'),
    list: rows({ label: text(4, '') }, 2),
  });

  it('parse never throws, whatever comes in', () => {
    for (const garbage of [null, undefined, 42, 'str', [], { kind: 9, n: 'NaN', t: {}, r: '', list: 'nope' }]) {
      expect(() => s.parse(garbage)).not.toThrow();
    }
  });

  it('clamps, trims, drops unknown keys, fills defaults', () => {
    const p = s.parse({ kind: 'zzz', n: 999, t: 'toolongtext', r: 'ok', hack: 1, list: [{ label: 'abcdef', evil: 1 }, {}, {}] });
    expect(p).toEqual({ kind: 'a', n: 10, t: 'toolo', r: 'ok', list: [{ label: 'abcd' }, { label: '' }] });
    expect('hack' in p).toBe(false);
  });

  it('required text falls back to its placeholder instead of failing', () => {
    expect(s.parse({}).r).toBe('PLACE');
    expect(s.parse({ r: '   ' }).r).toBe('PLACE');
  });

  it('jsonSchema is a closed object with required listed', () => {
    expect(s.jsonSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['r'] });
  });
});

describe.each(Object.keys(components) as ComponentId[])('component %s', (cid) => {
  const def = components[cid];
  const combos = enumCombos(def.jsonSchema);

  it('renders from defaults alone', () => {
    const { html, timeline } = render(cid, 'blk1', {}, CTXS.portraitCard);
    expect(html).toContain('#blk1');
    expect(timeline).toContain('tl.');
  });

  it.each(combos.map((c) => [JSON.stringify(c), c] as const))('all enum combos render scoped and script-free — %s', (_n, combo) => {
    for (const ctx of Object.values(CTXS)) {
      const { html, timeline } = render(cid, 'b2', combo, ctx);
      expect(html).not.toMatch(/<script/i);
      // every CSS selector in the style block is scoped under #b2
      const css = html.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
      for (const line of css.split('}')) {
        const sel = line.split('{')[0]?.trim();
        if (sel) expect(sel.startsWith('#b2'), `unscoped selector: ${sel}`).toBe(true);
      }
      // timeline only targets this block
      for (const m of timeline.matchAll(/querySelector\('([^']+)'\)|tl\.(?:from|to)\('([^']+)'/g)) {
        expect((m[1] ?? m[2] ?? '').startsWith('#b2')).toBe(true);
      }
    }
  });

  it('never tweens className', () => {
    // GSAP's className plugin caches and rewrites the element's whole inline style, clobbering any
    // autoAlpha/transform the same element is mid-tween on — it froze steps' items invisible once.
    // Emphasis must set the one property it means to change.
    for (const combo of combos) {
      const { timeline } = render(cid, 'b7', combo, CTXS.portraitCard);
      expect(timeline).not.toContain('className');
    }
  });

  it('never stacks two from() tweens on one selector', () => {
    // Two from()s on the same element make the second capture the first's mid-entrance hidden state
    // as its END value, freezing it invisible (hit once in comparison's winner emphasis).
    for (const combo of combos) {
      const { timeline } = render(cid, 'b8', combo, CTXS.portraitCard);
      const seen = new Set<string>();
      for (const m of timeline.matchAll(/tl\.from\('([^']+)'/g)) {
        const sel = m[1]!;
        expect(seen.has(sel), `two from() on ${sel}`).toBe(false);
        seen.add(sel);
      }
    }
  });

  it('flips ink light on a dark surface', () => {
    // A component that owns its background owns legibility on it: dark panel, light type, with no
    // second setting to remember. Skips components without a surface (their ink follows the theme).
    if (!('surfaceColor' in (def.jsonSchema as { properties: Record<string, unknown> }).properties)) return;
    const dark = render(cid, 'b9', { surface: 'card', surfaceColor: '#2E2C2B' }, CTXS.portraitCard).html;
    const wrap = dark.match(/\.wrap\{[^}]*\}/)?.[0] ?? '';
    const ink = wrap.match(/color:([^;]+);/)?.[1] ?? '';
    expect(ink).not.toContain('--sk-fg'); // the theme's dark ink would vanish on this panel
  });

  it('is deterministic', () => {
    const a = render(cid, 'b3', {}, CTXS.landscapeHalf);
    const b = render(cid, 'b3', {}, CTXS.landscapeHalf);
    expect(a).toEqual(b);
  });

  it('escapes hostile text props', () => {
    const HOSTILE = '<img src=x onerror=alert(1)>';
    const props = (def.jsonSchema as { properties: Record<string, { type?: string; enum?: unknown; items?: { properties?: Record<string, { type?: string; enum?: unknown }> } }> }).properties;
    const hostile: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v.type === 'string' && !v.enum) hostile[k] = HOSTILE;
      // rows: one hostile row covering every string field of the row schema
      if (v.type === 'array' && v.items?.properties) {
        hostile[k] = [
          Object.fromEntries(
            Object.entries(v.items.properties)
              .filter(([, f]) => f.type === 'string' && !f.enum)
              .map(([fk]) => [fk, HOSTILE]),
          ),
        ];
      }
    }
    const { html } = render(cid, 'b4', hostile, CTXS.portraitCard);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('font sizes stay within designed bounds at box extremes', () => {
    for (const ctx of [CTXS.tiny, CTXS.huge]) {
      const { html } = render(cid, 'b5', {}, ctx);
      for (const m of html.matchAll(/font-size:(\d+)px/g)) {
        const px = Number(m[1]);
        expect(px).toBeGreaterThanOrEqual(12);
        expect(px).toBeLessThanOrEqual(640);
      }
    }
  });

  it('CJK context steps display type down, never up', () => {
    const latin = render(cid, 'b6', {}, CTXS.portraitCard).html.match(/font-size:(\d+)px/);
    const cjk = render(cid, 'b6', {}, CTXS.cjk).html.match(/font-size:(\d+)px/);
    expect(Number(cjk?.[1])).toBeLessThanOrEqual(Number(latin?.[1]));
  });
});

describe('registry', () => {
  it('unknown component throws (host bug, not model output)', () => {
    expect(() => render('nope', 'x', {}, CTXS.portraitCard)).toThrow(/unknown component/);
  });
  it('every component ships schema, defaults and summary', () => {
    for (const def of Object.values(components)) {
      expect(def.jsonSchema).toMatchObject({ type: 'object' });
      expect(typeof def.summary).toBe('string');
      expect(def.summary.length).toBeGreaterThan(10);
    }
  });
});
