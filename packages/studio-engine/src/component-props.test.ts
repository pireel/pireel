import { describe, expect, it } from 'vitest';
import {
  bakeComponentPropsDefaults,
  blockPropsSchema,
  componentPropsAttrs,
  componentPropsFontIds,
  componentPropsInlineCss,
  componentPropsJsonSchema,
  componentPropsLiveMessage,
  componentPropsRequirement,
  componentPropsUsage,
  componentPropsView,
  dataEditFields,
  imageSlots,
  parseComponentProps,
  pruneComponentProps,
  resolveComponentProps,
} from './component-props';

const MANIFEST = {
  accent: { type: 'string', format: 'color', title: '强调色', default: '#ff5a36' },
  value: { type: 'number', title: '数值', default: 72, minimum: 0, maximum: 100, multipleOf: 1 },
  badge: { type: 'boolean', title: '角标', default: true },
  layout: { type: 'string', title: '布局', default: 'row', enum: ['row', 'column'] },
};
const SCHEMA = JSON.stringify(MANIFEST);
// The markup consumes the props (used by componentPropsUsage); the schema now lives in a slot, not here.
const markup = `<div class="wrap"><style>#b1 .bar{width:calc(var(--p-value) * 1%);background:var(--p-accent)} #b1[data-p-layout="column"] .wrap{flex-direction:column} #b1[data-p-badge="false"] .badge{display:none}</style><b class="bar"></b><i class="badge"></i></div>`;
const schema = (m: unknown) => (typeof m === 'string' ? m : JSON.stringify(m));

describe('component props schema (JSON Schema properties)', () => {
  it('parses a bare properties map and a wrapping {properties} identically; empty/absent = no props', () => {
    const a = parseComponentProps(SCHEMA);
    expect(a.issues).toEqual([]);
    expect(a.specs).toHaveLength(4);
    expect(parseComponentProps(schema({ properties: MANIFEST })).specs).toEqual(a.specs);
    expect(a.specs[3]).toEqual({ key: 'layout', type: 'select', label: '布局', default: 'row', options: ['row', 'column'] });
    expect(a.specs[1]).toMatchObject({ type: 'number', min: 0, max: 100, step: 1 });
    expect(parseComponentProps(undefined)).toEqual({ specs: [], issues: [] });
    expect(parseComponentProps('   ')).toEqual({ specs: [], issues: [] });
  });

  it('reads the schema from slots.propsSchema, or falls back to a legacy inline data-props attribute', () => {
    // New model: the schema lives in slots.propsSchema.
    expect(blockPropsSchema({ templateId: 'custom', slots: { propsSchema: SCHEMA } })).toBe(SCHEMA);
    // Back-compat: a component saved before the move keeps its inline data-props attribute (entity-encoded too).
    const legacyInner = `<div data-props='${SCHEMA}'></div>`;
    expect(parseComponentProps(blockPropsSchema({ templateId: 'custom', slots: { innerHtml: legacyInner } })).specs).toHaveLength(4);
    const entityInner = `<div data-props="${SCHEMA.replaceAll('"', '&quot;')}"></div>`;
    expect(parseComponentProps(blockPropsSchema({ templateId: 'custom', slots: { innerHtml: entityInner } })).specs).toHaveLength(4);
    // slots.propsSchema wins over any inline attribute.
    expect(blockPropsSchema({ templateId: 'custom', slots: { propsSchema: SCHEMA, innerHtml: '<div data-props=\'{"x":1}\'></div>' } })).toBe(SCHEMA);
    expect(blockPropsSchema({ templateId: 'custom', slots: { innerHtml: '<div></div>' } })).toBeUndefined();
  });

  it('rejects every malformed schema with a pointed issue and no specs', () => {
    const bad = (m: unknown) => parseComponentProps(schema(m));
    expect(bad('{oops').issues[0]).toMatch(/valid JSON/);
    expect(bad([{ key: 'x' }]).issues[0]).toMatch(/JSON object/);
    expect(bad({ Accent: { type: 'string', format: 'color', default: '#fff' } }).issues[0]).toMatch(/kebab/);
    expect(bad({ a: { type: 'string', default: 'x' } }).issues[0]).toMatch(/text is edited through data-edit/);
    expect(bad({ a: { type: 'array', default: [] } }).issues[0]).toMatch(/type must be/);
    expect(bad({ a: { type: 'string', format: 'color', default: 'red' } }).issues[0]).toMatch(/color default/);
    expect(bad({ a: { type: 'number', default: 5, minimum: 10, maximum: 20 } }).issues[0]).toMatch(/within/);
    expect(bad({ a: { type: 'string', enum: ['Big Bad'], default: 'Big Bad' } }).issues[0]).toMatch(/enum members/);
    expect(bad({ a: { type: 'string', enum: ['y'], default: 'x' } }).issues[0]).toMatch(/one of the enum members/);
    expect(bad({ a: { type: 'boolean', default: true, title: '<b>' } }).issues[0]).toMatch(/< or >/);
    expect(bad(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, { type: 'boolean', default: true }]))).issues[0]).toMatch(/at most 8/);
    for (const m of ['{oops', { a: { type: 'string', default: 'x' } }]) expect(bad(m).specs).toEqual([]);
    expect(parseComponentProps(schema({ a: { type: 'string', format: 'color', default: 'var(--accent)' } })).specs[0]?.default).toBe('var(--accent)');
  });

  it('resolves overrides with kit semantics: coerce, clamp, drop unknown, fall back on junk', () => {
    const { specs } = parseComponentProps(SCHEMA);
    expect(resolveComponentProps(specs, undefined)).toEqual({ accent: '#ff5a36', value: 72, badge: true, layout: 'row' });
    expect(resolveComponentProps(specs, { accent: '#00ff00aa', value: '250', badge: 'false', layout: 'column', ghost: 1 }))
      .toEqual({ accent: '#00ff00aa', value: 100, badge: false, layout: 'column' });
    expect(resolveComponentProps(specs, { accent: 'red', value: 'abc', badge: 'nope', layout: 'grid' }))
      .toEqual({ accent: '#ff5a36', value: 72, badge: true, layout: 'row' });
    expect(pruneComponentProps(SCHEMA, { accent: '#000', value: 72, ghost: 1 })).toEqual({ accent: '#000' });
    expect(pruneComponentProps(SCHEMA, { value: 72 })).toBeUndefined();
    expect(pruneComponentProps(undefined, { a: 1 })).toBeUndefined();
  });

  it('materializes inline custom properties and attributes byte-exactly, in one formatting', () => {
    const { specs } = parseComponentProps(SCHEMA);
    const values = resolveComponentProps(specs, { value: 33.3333333, layout: 'column' });
    expect(componentPropsInlineCss(specs, values)).toBe('--p-accent:#ff5a36;--p-value:33.333;');
    expect(componentPropsAttrs(specs, values)).toBe('data-p-accent="#ff5a36" data-p-value="33.333" data-p-badge="true" data-p-layout="column"');
    expect(componentPropsLiveMessage(specs, values)).toEqual({
      vars: { '--p-accent': '#ff5a36', '--p-value': '33.333' },
      attrs: { 'data-p-accent': '#ff5a36', 'data-p-value': '33.333', 'data-p-badge': 'true', 'data-p-layout': 'column' },
    });
    expect(componentPropsView(specs, values)[1]).toEqual({ key: 'value', type: 'number', value: 33.3333333 });
  });

  it('round-trips the schema as the JSON Schema the props form renders', () => {
    const { specs } = parseComponentProps(SCHEMA);
    const s = componentPropsJsonSchema(specs);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties).toEqual(MANIFEST);
  });

  it('spots unused keys and self-written declarations, but not attribute selectors', () => {
    const { specs } = parseComponentProps(SCHEMA);
    expect(componentPropsUsage(markup, specs)).toEqual({ unused: [], ownDeclarations: [] });
    const shadowed = markup.replace('<b class="bar">', '<b class="bar" style="--p-accent:#000" data-p-badge="false">');
    expect(componentPropsUsage(shadowed, specs).ownDeclarations).toEqual(['--p-accent', 'data-p-badge']);
    const lazy = markup.replace('background:var(--p-accent)', '');
    expect(componentPropsUsage(lazy, specs).unused).toEqual(['accent']);
  });

  it('bakes effective values into the schema defaults and round-trips', () => {
    const baked = bakeComponentPropsDefaults(SCHEMA, { accent: '#123456', layout: 'column', value: 999 });
    const { specs, issues } = parseComponentProps(baked);
    expect(issues).toEqual([]);
    expect(specs.map((s) => s.default)).toEqual(['#123456', 100, true, 'column']);
    expect(baked).toContain('"accent"');
    expect(bakeComponentPropsDefaults(undefined, { a: 1 })).toBeUndefined();
  });

  it('font properties resolve to a font id, materialize as the CSS family stack and report their stylesheet ids', () => {
    const s = schema({ face: { type: 'string', format: 'font', title: '字体', default: 'web:douyin-sans' }, accent: { type: 'string', format: 'color', default: '#000' } });
    const { specs, issues } = parseComponentProps(s);
    expect(issues).toEqual([]);
    expect(resolveComponentProps(specs, { face: 'google:Inter' }).face).toBe('google:Inter');
    expect(resolveComponentProps(specs, { face: 'preset' }).face).toBe('web:douyin-sans');
    expect(resolveComponentProps(specs, { face: 'web:nope' }).face).toBe('web:douyin-sans');
    expect(componentPropsInlineCss(specs, resolveComponentProps(specs, {}))).toContain('--p-face:&quot;Douyin Sans&quot;,sans-serif;');
    expect(componentPropsLiveMessage(specs, resolveComponentProps(specs, {})).vars['--p-face']).toBe('"Douyin Sans",sans-serif');
    expect(componentPropsLiveMessage(specs, resolveComponentProps(specs, { face: 'mono' })).attrs['data-p-face']).toBe('mono');
    expect(componentPropsFontIds({ templateId: 'custom', slots: { propsSchema: s, props: { face: 'google:Inter' } } })).toEqual(['google:Inter']);
    expect(parseComponentProps(schema({ face: { type: 'string', format: 'font', default: 'preset' } })).issues[0]).toMatch(/font default/);
  });

  it('states the generation floor: a schema with at least one colour', () => {
    expect(componentPropsRequirement(undefined)).toMatch(/must declare editable properties/);
    expect(componentPropsRequirement(schema({ n: { type: 'number', default: 1 } }))).toMatch(/at least one color/);
    expect(componentPropsRequirement(SCHEMA)).toBeNull();
    expect(componentPropsRequirement('{oops')).toBeNull(); // props-invalid owns that report
  });

  it('lists text and image slots the inspector edits through the existing paths', () => {
    const html = `<div><h1 data-edit="headline">Big <b>bold</b> title</h1><p data-edit='note'>  small  note </p><span data-edit="headline">dup</span><img src="a.png" alt="A"><img class="hf-media" src="body.mp4"><img src='b.png'></div>`;
    expect(dataEditFields(html)).toEqual([{ key: 'headline', text: 'Big bold title' }, { key: 'note', text: 'small note' }]);
    expect(imageSlots(html)).toEqual([{ index: 0, src: 'a.png', alt: 'A' }, { index: 2, src: 'b.png', alt: '' }]);
  });
});
