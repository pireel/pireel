import { describe, expect, it } from 'vitest';
import { assembleHtml, emptyComposition, newBlock } from './composition';

describe('句级花字层级', () => {
  it('字幕与组件共同服从全局轨道顺序(DOM 序即叠层)', () => {
    const comp = emptyComposition();
    const el = { ...newBlock('title', { startSec: 0 }), id: 'elem1', trackIndex: 9 };
    const cap = { ...newBlock('caption', { startSec: 0 }), id: 'cap1', trackIndex: 10 };
    comp.blocks = [cap, el];
    const html = assembleHtml(comp);
    expect(html.indexOf('id="cap1"')).toBeGreaterThan(html.indexOf('id="elem1"'));

    const lowered = assembleHtml({ ...comp, blocks: [{ ...cap, trackIndex: 1 }, el] });
    expect(lowered.indexOf('id="cap1"')).toBeLessThan(lowered.indexOf('id="elem1"'));
  });
});
