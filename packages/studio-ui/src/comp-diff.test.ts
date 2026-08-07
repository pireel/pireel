import { describe, expect, it } from 'vitest';
import type { Composition } from '@pireel/studio-engine/composition';
import { blockPatchableChange, shotFramingOnlyChange } from './comp-diff';

const base = (): Composition => ({
  width: 1080,
  height: 1920,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }],
});

describe('shotFramingOnlyChange', () => {
  it('preciseFraming takes the live preview/timeline fast path', () => {
    const a = base();
    const b = { ...a, shots: [{ ...a.shots![0]!, preciseFraming: { scale: 2, anchorX: 0.3, anchorY: 0.4 } }] };
    expect(shotFramingOnlyChange(a, b)).toBe(true);
  });
});

describe('blockPatchableChange', () => {
  it('keeps fitScale-only resize settlement on the in-place path', () => {
    const a = { ...base(), blocks: [{ id: 'b1', templateId: 'custom', slots: { innerHtml: '<b>x</b>' }, startSec: 0, durationSec: 2, trackIndex: 2, box: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } }] };
    const b = { ...a, blocks: [{ ...a.blocks[0]!, fitScale: 0.92 }] };
    expect(blockPatchableChange(a, b)).toEqual({ pairs: [], removed: [], added: [] });
  });
});
