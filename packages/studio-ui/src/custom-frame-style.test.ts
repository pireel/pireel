import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_VISUAL_STYLE } from '@pireel/studio-engine/visual-style';
import { customFrameCatalogItem } from './custom-frame-style';

describe('visual direction with user controls', () => {
  it('keeps the selected direction identity and its authored palette grammar', () => {
    const direction = {
      id: 'memphis-pop',
      title: '孟菲斯',
      summary: '几何、错位与弹性运动',
      icon: 'M',
      showcase: ['shape-hit'],
      palette: { panel: '#202020', accent: '#FF5A45', 'accent-2': '#47C6B2', 'panel-2': '#F1B9CF' },
    };
    const item = customFrameCatalogItem(
      DEFAULT_CUSTOM_VISUAL_STYLE,
      '视觉风格',
      '自由组合',
      direction,
    );
    expect(item.id).toBe('memphis-pop');
    expect(item.showcase).toEqual(['shape-hit']);
    expect(item.palette).toMatchObject({ panel: '#202020', accent: '#FF5A45', 'accent-2': '#47C6B2' });
    expect(item.customVisualStyle).toEqual(DEFAULT_CUSTOM_VISUAL_STYLE);
  });
});
