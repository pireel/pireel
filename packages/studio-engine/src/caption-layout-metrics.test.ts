import { describe, expect, it } from 'vitest';
import { captionLineSegments } from './caption-layout-metrics';
import { getCaptionPreset } from './caption-presets';

describe('captionLineSegments', () => {
  it('uses actual font-engine measurements when available instead of only glyph estimates', () => {
    const words = ['one', 'two', 'three', 'four'].map((text, index) => ({ text, start: index, end: index + 1 }));
    const preset = getCaptionPreset('ln-clean');
    const estimated = captionLineSegments(words, preset, 100, 1, 600, { measureText: () => null });
    const measured = captionLineSegments(words, preset, 100, 1, 600, { measureText: () => 200 });
    expect(estimated).toHaveLength(1);
    expect(measured.length).toBeGreaterThan(estimated.length);
  });
});

describe('caption font override', () => {
  it('renders and measures with the same overridden face, and falls back to the preset font', async () => {
    const { captionCanvasFontFamilies, captionFontCss } = await import('./caption-layout-metrics');
    const { getCaptionPreset } = await import('./caption-presets');
    const preset = getCaptionPreset('ln-clean');
    expect(captionFontCss(preset)).toBe('var(--font-body)');
    expect(captionFontCss(preset, 'serif')).toContain('Noto Serif SC');
    expect(captionCanvasFontFamilies(preset, 'serif')).toContain('Noto Serif SC');
    // A local (typically Latin-only) face carries the CJK display partner behind it.
    expect(captionFontCss(preset, 'local:Avenir%20Next')).toBe('"Avenir Next","Smiley Sans",sans-serif');
    expect(captionCanvasFontFamilies(preset, 'local:Avenir%20Next')).toBe('"Avenir Next","Smiley Sans",sans-serif');
    expect(captionFontCss(preset, 'preset')).toBe('var(--font-body)');
    expect(captionFontCss(preset, 'nonsense')).toBe('var(--font-body)');
  });
});
