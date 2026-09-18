import { describe, expect, it } from 'vitest';
import { buildBlockPrompt } from './compose';

describe('editable properties in the generation brief', () => {
  const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' };
  it('lists the tuned values and asks the model to keep the keys, only when there are any', () => {
    const prompt = buildBlockPrompt({ block: { ...block, props: [{ key: 'accent', type: 'color', value: '#000000' }, { key: 'badge', type: 'boolean', value: false }] }, instruction: 'x' });
    expect(prompt).toContain('Current EDITABLE PROPERTIES');
    expect(prompt).toContain('accent (color) = "#000000"');
    expect(prompt).toContain('badge (boolean) = false');
    expect(buildBlockPrompt({ block, instruction: 'x' })).not.toContain('EDITABLE PROPERTIES');
  });
});
