import { describe, expect, it } from 'vitest';
import { buildBlockPrompt, parseBlockResponse } from './compose';
import { BLOCK_SYSTEM } from './prompts';
import { componentContractExample, componentCoordinateContext, COMPONENT_COORDINATE_CONTRACT } from './component-authoring-contract';
import { lintBlock } from './block-lint';

describe('source-first component contract', () => {
  it('gives the model an example that passes the same complete validator', () => {
    const parsed = parseBlockResponse(componentContractExample('actual-id'), { innerHtml: '', timelineBody: '' });
    expect(lintBlock({ ...parsed, blockId: 'actual-id', requireProps: true })).toEqual([]);
    expect(parsed.propsSchema).toContain('accent');
  });
  it('uses the actual target coordinate system instead of contradictory universal size limits', () => {
    const prompt = buildBlockPrompt({ block: { id: 'g1', kind: 'custom', innerHtml: '', timelineBody: '', boxPx: { w: 1920, h: 1080 } }, instruction: 'Create a graphic' });
    expect(BLOCK_SYSTEM).toContain(COMPONENT_COORDINATE_CONTRACT);
    expect(BLOCK_SYSTEM).not.toContain('FIXED 1080px-wide');
    expect(prompt).toContain('Target box: 1920×1080');
    expect(prompt).not.toContain('largest headline ≤');
    expect(prompt).toContain('.label{');
  });
  it('explains SVG user units before the model edits a built-in artboard', () => {
    const html = '<svg class="artboard-frame" data-pireel-art-preset="5" viewBox="0 0 120 67.5" preserveAspectRatio="none"><foreignObject x="0" y="0" width="120" height="67.5"><div>Text</div></foreignObject></svg>';
    const prompt = componentCoordinateContext({ innerHtml: html, boxPx: { w: 580.608, h: 326.592 } });
    expect(prompt).toContain('scale 4.8384');
    expect(prompt).toContain('6 local px renders at 29.03 canvas px');
    expect(prompt).toContain('do not apply the 24px canvas guideline directly to SVG user units');
  });
});
