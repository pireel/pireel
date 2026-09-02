import { afterEach, describe, expect, it } from 'vitest';
import { displayTextFontCss, isDisplayTextFontId } from './display-text-presets';
import { captionCanvasFontFamilies, captionFontCss } from './caption-layout-metrics';
import { getCaptionPreset } from './caption-presets';
import { setWebFontBase, webFontCssUrl, webFontIdOf, webFontStylesheetUrls } from './font-library';

describe('web font library', () => {
  afterEach(() => setWebFontBase(''));

  it('recognizes library ids and rejects unknown ones', () => {
    expect(webFontIdOf('web:smiley-sans')).toBe('smiley-sans');
    expect(webFontIdOf('web:nope')).toBeNull();
    expect(isDisplayTextFontId('web:lxgw-wenkai')).toBe(true);
    expect(isDisplayTextFontId('web:nope')).toBe(false);
  });

  it('maps a web font to its family stack and pairs a local Latin font with the CJK partner', () => {
    expect(displayTextFontCss('web:zcool-kuaile')).toBe('"ZCOOL KuaiLe",sans-serif');
    expect(displayTextFontCss('local:Impact')).toBe('"Impact","Smiley Sans",sans-serif');
    const preset = getCaptionPreset('ln-clean');
    expect(captionFontCss(preset, 'web:ma-shan-zheng')).toBe('"Ma Shan Zheng",sans-serif');
    expect(captionCanvasFontFamilies(preset, 'web:ma-shan-zheng')).toBe('"Ma Shan Zheng",sans-serif');
    expect(captionCanvasFontFamilies(preset, 'local:Impact')).toBe('"Impact","Smiley Sans",sans-serif');
  });

  it('lists the stylesheets a document needs, adding the partner for local fonts, on the configured base', () => {
    expect(webFontStylesheetUrls(['web:long-cang', 'sans', undefined, 'web:long-cang'])).toEqual(['https://cdn.pireel.com/fonts/long-cang/result.css']);
    expect(webFontStylesheetUrls(['local:Futura'])).toEqual(['https://cdn.pireel.com/fonts/smiley-sans/result.css']);
    setWebFontBase('https://static.example/f/');
    expect(webFontCssUrl('ximaiti')).toBe('https://static.example/f/ximaiti/result.css');
  });
});
