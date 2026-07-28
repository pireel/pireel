import { describe, expect, it } from 'vitest';
import { render, type Blueprint } from './index';

const CTX = { box: { w: 900, h: 500 }, canvas: { w: 1080, h: 1920 } };
const bp = (over: Partial<Blueprint> = {}): Blueprint => ({
  id: 'bp1',
  component: 'metric',
  name: 'Test',
  html: '<div class="bp-root"><div class="num">{{value}}</div>{{?note}}<div class="foot">{{note}}</div>{{/}}</div>',
  css: '.num{font-size:{{hero}}px}.foot{font-size:{{labelPx}}px}',
  ...over,
});
const styleOf = (html: string) => html.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
const selectors = (css: string) =>
  css.split('}').map((c) => c.split('{')[0]?.trim()).filter((s): s is string => !!s);

describe('blueprint staging', () => {
  it('renders a theme staging through the component', () => {
    const { html } = render('metric', 'b1', { value: '47%' }, { ...CTX, blueprint: bp() });
    expect(html).toContain('47%');
    expect(html).toContain('#b1 .num');
  });

  it('scopes every rule to the block — an unscoped selector cannot be expressed', () => {
    const evil = bp({ css: '.a{color:red} } body{display:none} .b{color:blue' });
    const css = styleOf(render('metric', 'b2', { value: '1' }, { ...CTX, blueprint: evil }).html);
    for (const sel of selectors(css)) expect(sel.startsWith('#b2'), `leaked: ${sel}`).toBe(true);
    expect(css).not.toMatch(/}\s*body\s*\{/);
  });

  it('sizes from the box, not from written pixels', () => {
    const big = render('metric', 'b3', { value: '1' }, { ...CTX, blueprint: bp() }).html;
    const small = render('metric', 'b3', { value: '1' }, { box: { w: 260, h: 150 }, canvas: CTX.canvas, blueprint: bp() }).html;
    const px = (h: string) => Number(h.match(/\.num\{font-size:(\d+)px/)?.[1]);
    expect(px(small)).toBeLessThan(px(big));
    expect(px(small)).toBeGreaterThan(0);
  });

  it('escapes hostile content and cannot inject through CSS values', () => {
    const { html } = render('metric', 'b4', { value: '<img src=x onerror=alert(1)>' }, { ...CTX, blueprint: bp() });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('props still go through the component schema', () => {
    // 'nope' is not a valid trend; the schema replaces it before the blueprint ever sees it
    const { html } = render('metric', 'b5', { value: '1', trend: 'nope' }, { ...CTX, blueprint: bp({ html: '<div class="bp-root">{{trend}}</div>' }) });
    expect(html).toContain('none');
    expect(html).not.toContain('nope');
  });

  it('repeats rows and skips empty conditionals', () => {
    const listBp = bp({
      component: 'chart',
      html: '<div class="bp-root">{{#series}}<i class="r">{{n}}:{{label}}={{value}}</i>{{/}}</div>',
    });
    const { html } = render('chart', 'b6', { series: [{ label: 'a', value: 3 }, { label: 'b', value: 5 }] }, { ...CTX, blueprint: listBp });
    expect(html).toContain('1:a=3');
    expect(html).toContain('2:b=5');
    const { html: noNote } = render('metric', 'b7', { value: '1' }, { ...CTX, blueprint: bp() });
    expect(noNote).not.toContain('class="foot"');
  });

  it('unknown fields degrade to a gap instead of throwing', () => {
    const { html } = render('metric', 'b8', { value: '1' }, { ...CTX, blueprint: bp({ html: '<div class="bp-root">[{{nope}}]</div>' }) });
    expect(html).toContain('[]');
  });

  it('motion comes from presets — a blueprint cannot hand-write a tween', () => {
    const { timeline } = render('metric', 'b9', { value: '1' }, {
      ...CTX,
      blueprint: bp({ motion: [{ sel: '.num', preset: 'heroLand', at: 0.3 }] }),
    });
    expect(timeline).toContain("tl.from('#b9 .num'");
    expect(timeline).toContain('back.out'); // the library's tuned easing, not the author's
  });

  it('ignores a blueprint meant for another component', () => {
    const { html } = render('callout', 'b10', { text: 'hi' }, { ...CTX, blueprint: bp() });
    expect(html).not.toContain('.num'); // fell back to the built-in staging
  });
});

describe('nested sections', () => {
  // Regression: a lazy section match closed the loop at the first {{/}} it met, so a row body
  // containing an optional field rendered ONE truncated item. Every list staging hit this.
  const list = bp({
    component: 'steps',
    html: '<div class="bp-root">{{#items}}<p class="r">{{text}}{{?note}}<i>{{note}}</i>{{/}}</p>{{/}}</div>',
    css: '.r{font-size:{{labelPx}}px}',
  });

  it('renders every row when a row contains an optional field', () => {
    const { html } = render('steps', 'k', { items: [{ text: 'one', note: 'n1' }, { text: 'two' }, { text: 'three', note: 'n3' }] }, { ...CTX, blueprint: list });
    expect(html.match(/class="r"/g)).toHaveLength(3);
    expect(html).toContain('two');
    expect(html).toContain('three');
  });

  it('keeps the optional field per row, not across rows', () => {
    const { html } = render('steps', 'k', { items: [{ text: 'one', note: 'n1' }, { text: 'two' }] }, { ...CTX, blueprint: list });
    expect(html.match(/<i>/g)).toHaveLength(1);
  });

  it('leaves an unbalanced template as literal text rather than guessing', () => {
    const broken = bp({ component: 'steps', html: '<div class="bp-root">{{#items}}<p>{{text}}</p></div>' });
    expect(() => render('steps', 'k', { items: [{ text: 'x' }] }, { ...CTX, blueprint: broken })).not.toThrow();
  });
});
