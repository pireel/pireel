import { describe, expect, it } from 'vitest';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { artDirectedTemplateElement, artDirectedTemplateIds } from './gen-templates/element-presets';

describe('first-party authoring references', () => {
  it.each(artDirectedTemplateIds())('%s is accepted by the same component contract given to models', (id) => {
    const element = artDirectedTemplateElement({ id, category: 'test', prompt: '' }, 'Reference')!;
    const blocking = lintBlock({
      blockId: element.seedId, innerHtml: element.innerHtml, timelineBody: element.timelineBody,
      requireProps: true, boxPx: { w: 640, h: 360 },
    }).filter((issue) => HARD_LINT_CODES.has(issue.code));
    expect(blocking, `${id}: ${JSON.stringify(blocking)}`).toEqual([]);
  });
});
