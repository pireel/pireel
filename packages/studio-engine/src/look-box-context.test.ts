import { describe, expect, it } from 'vitest';
import { blockInItsBox } from './assemble';
import { renderBlock, type Block } from './composition-core';

describe('a look piece reads the box it renders in', () => {
  it('gets its own box in pixels, not the canvas', () => {
    const block = { id: 'look1', templateId: 'look:toggle', startSec: 0, durationSec: 3, box: { x: 0, y: 0, w: 1, h: 0.4 }, slots: { props: {} } } as unknown as Block;
    const { timelineBody } = renderBlock(blockInItsBox(block, 1080, 1920));
    expect(timelineBody).toContain('"width":1080');
    expect(timelineBody).toContain('"height":768');
  });
});
