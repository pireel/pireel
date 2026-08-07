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
