import { describe, expect, it } from 'vitest';
import { componentPreviewModel } from './component-preview';

describe('componentPreviewModel', () => {
  it('previews a native kit component in the box an insert gives it, framed on that box', () => {
    const model = componentPreviewModel({ id: 'kit:metric', label: 'Metric', kit: 'metric' });

    expect(model?.comp).toMatchObject({ width: 1080, height: 1920, theme: 'general' });
    expect(model?.block).toMatchObject({
      templateId: 'kit:metric',
      slots: { props: { value: '47%', trend: 'up' } },
      box: { x: 0.07, y: 0.34, w: 0.86, h: 0.3 },
    });
    expect(model?.focus?.w).toBeCloseTo(0.86 * 1080);
    expect(model?.focus?.h).toBeCloseTo(0.3 * 1920);
    expect(model?.insertProps).toEqual({ value: '47%', trend: 'up' });
    const landscape = componentPreviewModel({ id: 'kit:metric', label: 'Metric', kit: 'metric' }, { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots: [] });
    expect(landscape?.comp).toMatchObject({ width: 1920, height: 1080 });
  });

  it('normalizes an authored component with its design canvas and animation', () => {
    const model = componentPreviewModel({
      id: 'template:hero',
      label: 'Hero',
      element: {
        seedId: 'hero_seed',
        label: 'Hero',
        innerHtml: '<div>Hero</div>',
        timelineBody: "tl.from('#hero_seed', {opacity:0})",
        designW: 1200,
        designH: 800,
      },
    });

    expect(model?.comp).toMatchObject({ width: 1200, height: 800 });
    expect(model?.block).toMatchObject({
      id: 'hero_seed',
      templateId: 'custom',
      slots: {
        innerHtml: '<div>Hero</div>',
        timelineBody: "tl.from('#hero_seed', {opacity:0})",
      },
    });
    expect(model?.insertProps).toBeUndefined();
  });

  it('keeps the current project canvas for unversioned authored components', () => {
    const model = componentPreviewModel(
      {
        id: 'generated',
        label: 'Generated',
        element: { seedId: 'generated_seed', label: 'Generated', innerHtml: '', timelineBody: '' },
      },
      { width: 1080, height: 1920, theme: 'general', video: null, blocks: [], shots: [], palette: { paper: '#001122' } },
    );

    expect(model?.comp).toMatchObject({ width: 1080, height: 1920, theme: 'general', palette: { paper: '#001122' } });
  });

  it('rejects an element entry without a render payload', () => {
    expect(componentPreviewModel({ id: 'empty', label: 'Empty' })).toBeNull();
  });
});
