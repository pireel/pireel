import { describe, expect, it } from 'vitest';
import { assembleHtml, emptyComposition, newBlock } from './composition';

describe('句级花字层级', () => {
  it('花字渲染在所有组件之后(DOM 序即叠层)', () => {
    const comp = emptyComposition();
    const el = { ...newBlock('title', { startSec: 0 }), id: 'elem1', trackIndex: 9 };
    const cap = { ...newBlock('caption', { startSec: 0 }), id: 'cap1', trackIndex: 1 };
    comp.blocks = [cap, el];
    const html = assembleHtml(comp);
    expect(html.indexOf('id="cap1"')).toBeGreaterThan(html.indexOf('id="elem1"'));
  });
});
