import { describe, expect, it } from 'vitest';
import { GOOGLE_FONTS } from './google-fonts-catalog';
import { googleFontCssUrl, googleFontRowOf, resolveGoogleFontReference, searchGoogleFonts } from './google-fonts';
import { WEB_FONTS, fontStylesheetUrlFor, searchFonts, webFontStylesheetUrls } from './font-library';
import { displayFontContext, displayTextFontCss, isDisplayTextFontId } from './display-text-presets';
import { searchFontsTool } from './font-search-tool';

describe('google fonts source', () => {
  it('snapshot never duplicates a library or base face', () => {
    const library = new Set([...WEB_FONTS.map((f) => f.family.toLowerCase()), 'noto sans sc', 'noto serif sc', 'ibm plex mono']);
    expect(GOOGLE_FONTS.filter((row) => library.has(row.f.toLowerCase()))).toEqual([]);
    expect(GOOGLE_FONTS.length).toBeGreaterThan(1000);
  });

  it('resolves google:<Family> case-insensitively and builds the css2 request', () => {
    expect(googleFontRowOf('google:inter')?.f).toBe('Inter');
    expect(resolveGoogleFontReference('google:Playfair Display')).toBe('google:Playfair Display');
    expect(googleFontRowOf('google:No Such Face')).toBeNull();
    expect(googleFontRowOf('web:inter')).toBeNull();
    const inter = googleFontRowOf('google:Inter')!;
    expect(googleFontCssUrl(inter)).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:wght@\d+\.\.\d+&display=swap$/);
    const staticFace = GOOGLE_FONTS.find((row) => !row.v && row.w.length > 1)!;
    expect(googleFontCssUrl(staticFace)).toContain(`:wght@${staticFace.w.join(';')}`);
  });

  it('is a first-class font id everywhere the text surfaces resolve one', () => {
    expect(isDisplayTextFontId('google:Inter')).toBe(true);
    expect(displayTextFontCss('google:Inter')).toBe('"Inter","Smiley Sans",sans-serif');
    expect(displayFontContext('google:Inter')).toEqual({ id: 'google:Inter', family: 'Inter', label: 'Inter' });
    expect(fontStylesheetUrlFor('google:Inter')).toContain('family=Inter');
    const urls = webFontStylesheetUrls(['google:Inter', 'web:lxgw-wenkai']);
    expect(urls.some((u) => u.includes('/lxgw-wenkai/'))).toBe(true);
    expect(urls.some((u) => u.includes('/smiley-sans/'))).toBe(true); // the CJK partner rides along
    expect(urls.some((u) => u.includes('fonts.googleapis.com/css2?family=Inter'))).toBe(true);
  });

  it('searches library first, then Google by popularity, with script and category filters', () => {
    const zh = searchFonts('', { script: 'zh-Hans', limit: 40 });
    expect(zh[0]?.source).toBe('library');
    expect(zh.filter((h) => h.source === 'library').length).toBe(WEB_FONTS.length);
    expect(zh.every((h) => h.scripts.includes('zh-Hans'))).toBe(true);
    const mono = searchGoogleFonts('', { category: 'mono', limit: 5 });
    expect(mono.length).toBe(5);
    expect(mono.every((h) => h.category === 'mono')).toBe(true);
    expect(searchFonts('霞鹜')[0]).toMatchObject({ id: 'web:lxgw-wenkai', source: 'library' });
    expect(searchFonts('playfair')[0]).toMatchObject({ id: 'google:Playfair Display', source: 'google' });
    expect(searchFonts('zzzz-no-font')).toEqual([]);
  });

  it('tool body validates loosely and returns ids with a usage hint', () => {
    const out = searchFontsTool({ query: 'inter', category: 'sans', limit: 3 });
    expect(out.ok).toBe(true);
    expect(out.data.fonts.length).toBeLessThanOrEqual(3);
    expect(out.data.fonts[0]?.id.startsWith('google:')).toBe(true);
    expect(searchFontsTool({ script: 'nope', limit: 'x' }).data.fonts.length).toBeGreaterThan(0);
  });
});
