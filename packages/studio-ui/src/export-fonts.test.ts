import { beforeEach } from 'vitest';
import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';
beforeEach(() => setStudioProviders({ ...unavailableProviders(), mediaProxyUrl: url => `/api/media/fetch?url=${encodeURIComponent(url)}` }));
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildInlineFonts,
  documentGeneratesText,
  fontFamilyNames,
  fontRequestsIn,
  fontRulesCss,
  fontRulesFor,
  fontWarmups,
  matchedFontWeights,
  type FontStyleRead,
  type InlineFontRule,
} from './export-fonts';
import { loadLocalFontFamilies } from './local-font-access';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The rules as the one stylesheet they used to be. */
const buildInlineFontCss = async (...args: Parameters<typeof buildInlineFonts>) => fontRulesCss(await buildInlineFonts(...args));

describe('buildInlineFontCss', () => {
  it('does not make font requests for a composition with only formatting whitespace', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(buildInlineFontCss('\n  \t')).resolves.toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('downloads one exact-subset binary once when several weights share its URL', async () => {
    const fontUrl = 'https://fonts.gstatic.com/l/font?kit=shared';
    const css = [400, 500, 700]
      .map((weight) => `@font-face{font-family:'Noto Sans SC';font-style:normal;font-weight:${weight};src:url(${fontUrl}) format('woff2');unicode-range:U+41;}`)
      .join('\n');
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('fonts.googleapis.com')) return new Response(css, { status: 200 });
      if (url.includes(encodeURIComponent(fontUrl))) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);

    const result = await buildInlineFontCss('A');

    expect(result.match(/@font-face/g)).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('embeds a granted system font into export CSS', async () => {
    vi.stubGlobal('window', {
      queryLocalFonts: vi.fn(async () => [{
        family: 'Demo Sans', fullName: 'Demo Sans Regular', postscriptName: 'DemoSans-Regular', style: 'Regular',
        blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'font/ttf' }),
      }]),
    });
    await loadLocalFontFamilies();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    const result = await buildInlineFontCss('系统字体', undefined, ['Demo Sans']);

    expect(result).toContain('font-family:"Demo Sans"');
    expect(result).toContain('data:font/ttf;base64,AQID');
  });
});

describe('library web fonts in export', () => {
  const chunkCss = [
    '@font-face{font-family:"ZCOOL KuaiLe";src:local("ZCOOL KuaiLe"),url("./han.woff2")format("woff2");font-style:normal;font-display:swap;unicode-range:U+4E2D;}',
    '@font-face{font-family:"ZCOOL KuaiLe";src:local("ZCOOL KuaiLe"),url("./latin.woff2")format("woff2");font-style:normal;font-display:swap;unicode-range:U+41-5A;}',
  ].join('\n');

  it('embeds only the chunks the used glyphs fall in, resolved against the stylesheet url', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('fonts.googleapis.com')) throw new Error('offline');
      if (url.endsWith('/fonts/zcool-kuaile/result.css')) return new Response(chunkCss, { status: 200 });
      if (url.endsWith('/fonts/zcool-kuaile/han.woff2')) return new Response(new Uint8Array([7, 8, 9]), { status: 200 });
      if (url.endsWith('/fonts/zcool-kuaile/latin.woff2')) throw new Error('latin chunk must not be requested');
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);

    const result = await buildInlineFontCss('中', undefined, [], ['web:zcool-kuaile']);

    expect(result).toContain('font-family:"ZCOOL KuaiLe"');
    expect(result).toContain('data:font/woff2;base64,BwgJ');
    expect(result).toContain('unicode-range:U+4e2d');
    expect(result.match(/@font-face/g)).toHaveLength(1);
  });

  it('carries the CJK partner along with a local Latin face', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requested.push(decodeURIComponent(String(input)));
      throw new Error('offline');
    }));

    await buildInlineFontCss('中', undefined, ['Impact']);

    expect(requested.some((url) => url.endsWith('/fonts/smiley-sans/result.css'))).toBe(true);
  });
});

const rule = (family: string, weight: string, range: [number, number] | null, style = 'normal'): InlineFontRule => ({
  family, style, weight, ranges: range ? [range] : null, css: `@font-face{${family} ${style} ${weight} ${range ?? 'all'}}`,
});

describe('buildInlineFonts', () => {
  it('keeps what each rule serves beside its text', async () => {
    const css = [
      "@font-face{font-family:'Noto Sans SC';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/a.woff2) format('woff2');unicode-range:U+4E00-4EFF;}",
      "@font-face{font-family:'Noto Sans SC';font-style:normal;font-weight:700;src:url(https://fonts.gstatic.com/b.woff2) format('woff2');unicode-range:U+4E00-4EFF;}",
    ].join('\n');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes('fonts.googleapis.com') ? new Response(css, { status: 200 }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    )));

    const rules = await buildInlineFonts('中');

    expect(rules.map(({ family, style, weight, ranges }) => ({ family, style, weight, ranges }))).toEqual([
      { family: 'Noto Sans SC', style: 'normal', weight: '400', ranges: [[0x4e00, 0x4eff]] },
      { family: 'Noto Sans SC', style: 'normal', weight: '700', ranges: [[0x4e00, 0x4eff]] },
    ]);
    expect(rules[0]!.css).toContain('font-weight:400;src:url(data:font/woff2;base64,AQID)');
  });
});

describe('fontWarmups', () => {
  it('gives one piece per inlined face, with its rules and every used glyph', () => {
    const rules = [
      rule('Huxiaobo Nanshen Ti', '400', [0x4e00, 0x4fff]),
      rule('Huxiaobo Nanshen Ti', '400', [0x5000, 0x5fff]),
      rule('Alimama FangYuan Ti', '200 700', null),
    ];
    const pieces = fontWarmups(rules, '你好 <b> & 你');
    expect(pieces.map((piece) => piece.rules)).toEqual([[rules[0], rules[1]], [rules[2]]]); // two chunks of one face warm together
    expect(pieces[0]!.markup).toContain("font-family:'Huxiaobo Nanshen Ti';font-style:normal;font-weight:400;");
    expect(pieces[1]!.markup).toContain("font-family:'Alimama FangYuan Ti';font-style:normal;font-weight:450;");
    expect(pieces[0]!.markup).toContain('你好&lt;B&gt;&amp;');
    expect(pieces[0]!.markup).not.toContain('<b>');
    expect(fontWarmups([], 'x')).toEqual([]);
  });
});

describe('matchedFontWeights', () => {
  const declared = ['400', '500', '700', '900'];
  it('takes the declared weight when there is one, and a range that covers it', () => {
    expect(matchedFontWeights(declared, 500)).toEqual(['500']);
    expect(matchedFontWeights(['100 900', '400'], 400)).toEqual(['100 900', '400']);
    expect(matchedFontWeights(['normal', 'bold'], 700)).toEqual(['bold']);
  });
  it('goes heavier first above 500 and lighter first below 400', () => {
    expect(matchedFontWeights(declared, 600)).toEqual(['700']);
    expect(matchedFontWeights(declared, 800)).toEqual(['900']);
    expect(matchedFontWeights(['400', '500'], 800)).toEqual(['500']);
    expect(matchedFontWeights(declared, 300)).toEqual(['400']);
    expect(matchedFontWeights(['200', '700'], 300)).toEqual(['200']);
  });
  it('between 400 and 500 looks up to 500, then lighter, then heavier', () => {
    expect(matchedFontWeights(['400', '500', '700'], 450)).toEqual(['500']);
    expect(matchedFontWeights(['300', '700'], 450)).toEqual(['300']);
    expect(matchedFontWeights(['700', '900'], 400)).toEqual(['700']);
  });
});

describe('fontRulesFor', () => {
  const han = rule('Noto Sans SC', '400', [0x4e00, 0x4eff]);
  const hanBold = rule('Noto Sans SC', '700', [0x4e00, 0x4eff]);
  const other = rule('Noto Sans SC', '400', [0x5000, 0x50ff]);
  const latin = rule('Noto Sans SC', '400', [0x41, 0x5a]);
  const serif = rule('Noto Serif SC', '700', [0x4e00, 0x4eff]);
  const local = rule('Demo Sans', '100 900', null);
  const all = [han, hanBold, other, latin, serif, local];

  it('takes only the family, the matched weight and the pieces holding the characters', () => {
    expect(fontRulesFor(all, [{ families: ['Noto Sans SC', 'sans-serif'], weight: 400, style: 'normal', text: '中' }])).toEqual([han]);
    expect(fontRulesFor(all, [{ families: ['Noto Sans SC'], weight: 800, style: 'normal', text: '中' }])).toEqual([hanBold]);
    expect(fontRulesFor(all, [{ families: ['PingFang SC', 'system-ui'], weight: 400, style: 'normal', text: '中' }])).toEqual([]);
    expect(fontRulesFor(all, [{ families: ['Noto Sans SC'], weight: 400, style: 'normal', text: ' \n' }])).toEqual([]);
  });

  it('serves every family of the list, a whole-file face included, in the rules own order', () => {
    expect(fontRulesFor(all, [
      { families: ['Demo Sans', 'noto sans sc'], weight: 400, style: 'normal', text: '中' },
      { families: ['Noto Serif SC'], weight: 900, style: 'normal', text: '中' },
    ])).toEqual([han, serif, local]);
  });

  it('always brings the piece holding the space, which the line is measured with', () => {
    const basic = rule('Noto Sans SC', '400', [0x20, 0x7e]);
    const basicBold = rule('Noto Sans SC', '700', [0x20, 0x7e]);
    expect(fontRulesFor([han, hanBold, basic, basicBold], [{ families: ['Noto Sans SC'], weight: 400, style: 'normal', text: '中' }])).toEqual([han, basic]);
  });

  it('carries the other case of a letter, for text-transform', () => {
    expect(fontRulesFor(all, [{ families: ['Noto Sans SC'], weight: 400, style: 'normal', text: 'a' }])).toEqual([latin]);
  });

  it('uses the upright face when the family has no italic', () => {
    const italic = rule('Two Styles', '400', null, 'italic');
    const upright = rule('Two Styles', '400', null);
    expect(fontRulesFor([han], [{ families: ['Noto Sans SC'], weight: 400, style: 'italic', text: '中' }])).toEqual([han]);
    expect(fontRulesFor([italic, upright], [{ families: ['Two Styles'], weight: 400, style: 'italic', text: 'x' }])).toEqual([italic]);
    expect(fontRulesFor([italic, upright], [{ families: ['Two Styles'], weight: 400, style: 'normal', text: 'x' }])).toEqual([upright]);
  });
});

describe('fontFamilyNames', () => {
  it('reads quoted and bare names', () => {
    expect(fontFamilyNames('"Noto Sans SC", \'PingFang SC\', system-ui, -apple-system')).toEqual(['Noto Sans SC', 'PingFang SC', 'system-ui', '-apple-system']);
  });
});

describe('fontRequestsIn', () => {
  type Fake = { nodeType: number; tagName?: string; nodeValue?: string; childNodes?: Fake[]; font?: string; weight?: string; before?: string };
  const textNode = (value: string): Fake => ({ nodeType: 3, nodeValue: value });
  const element = (tagName: string, childNodes: Fake[], font = 'Body', weight = '400', before?: string): Fake => ({ nodeType: 1, tagName, childNodes, font, weight, ...(before ? { before } : {}) });
  const styleOf = (node: Element, pseudo?: string): FontStyleRead => {
    const fake = node as unknown as Fake;
    return { fontFamily: fake.font!, fontWeight: fake.weight!, fontStyle: 'normal', content: pseudo === '::before' ? fake.before ?? 'none' : 'none' };
  };
  const read = (nodes: Fake[], generated = false) => fontRequestsIn(nodes as unknown as Element[], styleOf, generated);

  it('groups the drawn text by how it is drawn, skipping scripts and styles', () => {
    const tree = element('DIV', [
      textNode('你'),
      element('SPAN', [textNode('好')], '"Display", Body', '700'),
      element('SPAN', [textNode('吗')]),
      element('STYLE', [textNode('.x{color:red}')]),
      element('SCRIPT', [textNode('var hidden = 1')]),
      element('SPAN', [textNode('  \n')], 'Unused'),
    ]);
    expect(read([tree])).toEqual([
      { families: ['Display', 'Body'], weight: 700, style: 'normal', text: '好' },
      { families: ['Body'], weight: 400, style: 'normal', text: '吗你' },
    ]);
  });

  it('reads generated boxes only when asked, and a counter asks for every printable character', () => {
    const quote = element('P', [], 'Serif', '900', '"“" " "');
    const counted = element('LI', [], 'Mono', 'bold', 'counter(step) "."');
    expect(read([quote, counted])).toEqual([]);
    const requests = read([quote, counted], true);
    expect(requests[0]).toEqual({ families: ['Serif'], weight: 900, style: 'normal', text: '“ ' });
    expect(requests[1]!.weight).toBe(700);
    expect(requests[1]!.text).toContain('.');
    expect(requests[1]!.text).toContain('0123456789');
  });
});

describe('documentGeneratesText', () => {
  const sheet = (rules: { selectorText?: string; content?: string; cssRules?: unknown[] }[]) => ({
    cssRules: rules.map((entry) => ({
      ...(entry.selectorText ? { selectorText: entry.selectorText, style: { getPropertyValue: () => entry.content ?? '' } } : {}),
      ...(entry.cssRules ? { cssRules: entry.cssRules } : {}),
    })),
  });
  const doc = (...sheets: unknown[]) => ({ styleSheets: sheets }) as unknown as Document;

  it('is false for decorative boxes and true once one prints a text', () => {
    expect(documentGeneratesText(doc(sheet([{ selectorText: '.box::before', content: '""' }, { selectorText: '.a', content: '"x"' }])))).toBe(false);
    expect(documentGeneratesText(doc(sheet([{ selectorText: '.quote::before', content: '"“"' }])))).toBe(true);
    expect(documentGeneratesText(doc(sheet([{ selectorText: 'li:after', content: 'counter(step)' }])))).toBe(true);
  });

  it('looks inside grouped rules and passes over a stylesheet it may not read', () => {
    const nested = sheet([{ cssRules: sheet([{ selectorText: '.q::after', content: '"”"' }]).cssRules }]);
    const closed = { get cssRules(): never { throw new Error('SecurityError'); } };
    expect(documentGeneratesText(doc(closed, nested))).toBe(true);
    expect(documentGeneratesText(doc(closed))).toBe(false);
  });
});
