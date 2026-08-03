import { describe, expect, it } from 'vitest';
import type { Composition } from '@pireel/studio-engine/composition';
import { shotFramingOnlyChange } from './comp-diff';

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
