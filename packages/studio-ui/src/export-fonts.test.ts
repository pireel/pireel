import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInlineFontCss } from './export-fonts';
import { loadLocalFontFamilies } from './local-font-access';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
