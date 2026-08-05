import { describe, expect, it } from 'vitest';
import { componentPreviewModel } from './component-preview';

describe('componentPreviewModel', () => {
  it('normalizes a native kit component into a full-canvas preview block', () => {
    const model = componentPreviewModel({ id: 'kit:metric', label: 'Metric', kit: 'metric' });

    expect(model?.comp).toMatchObject({ width: 1920, height: 1080, theme: 'general' });
    expect(model?.block).toMatchObject({
      templateId: 'kit:metric',
      slots: { props: { value: '47%', trend: 'up' } },
      box: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(model?.insertProps).toEqual({ value: '47%', trend: 'up' });
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
