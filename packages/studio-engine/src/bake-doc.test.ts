import { describe, expect, it } from 'vitest';
import { bakeCompositionHtml } from './assemble';
import type { Block, Composition } from './composition-core';

const block: Block = {
  id: 'b1', templateId: 'custom',
  slots: { innerHtml: '<div class="wrap"><style>#b1 .t{color:red}</style><b class="t">hi</b></div>', timelineBody: "tl.from('#b1 .t',{autoAlpha:0},0)" },
  startSec: 4, durationSec: 5, trackIndex: 1, box: { x: 0.1, y: 0.2, w: 0.6, h: 0.3 },
};
const comp: Composition = { width: 1080, height: 1920, theme: 'general', video: null, shots: [], blocks: [block] };

describe('bakeCompositionHtml', () => {
  it('renders the single block transparent with its timeline intact', () => {
    const html = bakeCompositionHtml(comp, block);
    // transparent ground so the render service outputs alpha
    expect(html).toContain('background:transparent');
    // the block's own timeline statement is present (the renderer plays it)
    expect(html).toContain("#b1 .t");
    // the block keeps its box (pixel-identical overlay), not forced to fill
    expect(html).toContain('data-composition-id="b1"');
    // no browser-preview boot-pause or rAF loop wrapper leaks into the bake doc
    expect(html).not.toContain('__hfBootT');
    expect(html).not.toContain('__hfPreview');
  });
});
