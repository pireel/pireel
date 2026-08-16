import { describe, expect, it } from 'vitest';
import type { ShotTreatment } from '@pireel/studio-engine/composition';
import { framingLayout, treatmentForLayout } from './shot-treatment-panel';

describe('shot framing layout compatibility', () => {
  it.each<[ShotTreatment, ReturnType<typeof framingLayout>]>([
    ['full', 'none'],
    ['punch-in', 'zoom'],
    ['split-t', 'split-top-bottom'],
    ['split-b', 'split-top-bottom'],
    ['split-l', 'split-left-right'],
    ['split-r', 'split-left-right'],
    ['corner-tl', 'presenter-corner'],
    ['corner-tr', 'presenter-corner'],
    ['corner-bl', 'presenter-corner'],
    ['corner-br', 'presenter-corner'],
  ])('groups the existing %s treatment under %s', (treatment, layout) => {
    expect(framingLayout(treatment)).toBe(layout);
  });

  it('uses existing treatment defaults for each first-level layout', () => {
    expect(treatmentForLayout('none', 'split-t')).toBe('full');
    expect(treatmentForLayout('zoom', 'split-t')).toBe('punch-in');
    expect(treatmentForLayout('split-top-bottom', 'full')).toBe('split-b');
    expect(treatmentForLayout('split-left-right', 'full')).toBe('split-r');
    expect(treatmentForLayout('presenter-corner', 'full')).toBe('corner-br');
  });

  it('preserves an existing secondary position when its layout is reselected', () => {
    expect(treatmentForLayout('split-top-bottom', 'split-t')).toBe('split-t');
    expect(treatmentForLayout('split-left-right', 'split-l')).toBe('split-l');
    expect(treatmentForLayout('presenter-corner', 'corner-tl')).toBe('corner-tl');
    expect(treatmentForLayout('presenter-corner', 'corner-tr')).toBe('corner-tr');
    expect(treatmentForLayout('presenter-corner', 'corner-bl')).toBe('corner-bl');
  });
});
