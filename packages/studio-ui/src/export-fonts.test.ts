import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInlineFontCss } from './export-fonts';

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
});
