import { describe, expect, it } from 'vitest';
import {
  emptyComposition,
  type Block,
  type SupplementalVisualMediaClip,
} from '@pireel/studio-engine/composition';
import { browserVisualLayerPlan } from './browser-visual-layer-plan';

const block: Block = {
  id: 'title', templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex: 1,
};
const visual: SupplementalVisualMediaClip = {
  clipId: 'pip', trackId: 'visual', stackOrder: 2, kind: 'image', source: 'https://cdn.test/pip.jpg',
  startSec: 0, endSec: 1, sourceInSec: 0, sourceOutSec: 1, fit: 'cover', muted: true,
};

describe('browser visual layer plan', () => {
  it('uses the neutral global plan when active narration has no person matte', () => {
    const comp = {
      ...emptyComposition(),
      blocks: [block],
      shots: [
        { id: 'active', srcStart: 0, srcEnd: 1, treatment: 'full' as const },
        { id: 'disabled-matte', srcStart: 1, srcEnd: 2, treatment: 'full' as const, personMatte: true },
      ],
    };
    const plan = browserVisualLayerPlan(comp, [visual], [{ shotId: 'active', startSec: 0, endSec: 1 }]);
    expect(plan.map((layer) => layer.kind)).toEqual(['html', 'media']);
  });

  it('keeps Pireel person extraction as media then one complete HTML pass', () => {
    const comp = {
      ...emptyComposition(), blocks: [block],
      shots: [{ id: 'matte', srcStart: 0, srcEnd: 1, treatment: 'full' as const, personMatte: true }],
    };
    const lowerVisual = { ...visual, clipId: 'lower', trackId: 'lower-track', stackOrder: 0 };
    const plan = browserVisualLayerPlan(comp, [visual, lowerVisual], [{ shotId: 'matte', startSec: 0, endSec: 1 }]);
    expect(plan.map((layer) => layer.kind)).toEqual(['media', 'html']);
    expect(plan[0]?.kind === 'media' ? plan[0].visuals.map((item) => item.clipId) : []).toEqual(['lower', 'pip']);
  });
});
