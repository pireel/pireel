import { describe, expect, it } from 'vitest';
import { assembleHtml, emptyComposition, type Block } from './composition';
import { compositionVisualLayerPlan, type SupplementalVisualMediaClip } from './visual-layer-plan';

const block = (id: string, trackIndex: number): Block => ({
  id, templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex,
});
const visual = (clipId: string, trackId: string, stackOrder: number): SupplementalVisualMediaClip => ({
  clipId, trackId, stackOrder, kind: 'image', source: `https://cdn.test/${clipId}.jpg`,
  startSec: 0, endSec: 1, sourceInSec: 0, sourceOutSec: 1, fit: 'cover', muted: true,
});

describe('composition visual layer plan', () => {
  it('interleaves media and HTML bottom-to-top while coalescing renderer passes', () => {
    const plan = compositionVisualLayerPlan(
      [block('low-title', 1), block('high-title', 5), block('caption', 6)],
      [visual('broll', 'v2', 2), visual('pip', 'v4', 4), visual('same-track', 'v4', 4)],
    );
    expect(plan.map((layer) => [
      layer.kind,
      layer.stackOrder,
      layer.kind === 'html' ? layer.blocks.map((item) => item.id) : layer.visuals.map((item) => item.clipId),
    ])).toEqual([
      ['html', 1, ['low-title']],
      ['media', 2, ['broll', 'pip', 'same-track']],
      ['html', 5, ['high-title', 'caption']],
    ]);
  });

  it('uses a deterministic media-below-HTML tie rule for legacy duplicate stack orders', () => {
    const plan = compositionVisualLayerPlan([block('title', 2)], [visual('pip', 'visual', 2)]);
    expect(plan.map((layer) => layer.kind)).toEqual(['media', 'html']);
  });

  it('drives iframe DOM stacking with the same global plan', () => {
    const html = assembleHtml(
      { ...emptyComposition(), blocks: [block('below', 1), block('above', 3)] },
      undefined,
      [],
      [visual('middle', 'visual', 2)],
    );
    expect(html.indexOf('id="below"')).toBeLessThan(html.indexOf('id="hf-visual-middle"'));
    expect(html.indexOf('id="hf-visual-middle"')).toBeLessThan(html.indexOf('id="above"'));
  });
});
