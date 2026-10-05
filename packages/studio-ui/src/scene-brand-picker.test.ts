import { describe, expect, it } from 'vitest';
import { emptyPlaybook } from '@pireel/studio-engine/brand-playbook';
import { withSceneBrand } from './scene-brand-picker';
import { sceneProjectOptions } from './caption-upload-dialog';

describe('withSceneBrand', () => {
  it('starts a scene from a copy of the brand and its captions, never its aspect', () => {
    const playbook = { ...emptyPlaybook('brand_1', 'Mine'), blocks: { captions: { on: true, style: { preset: 'ln-clean', color: '#ffcc00' } } } };
    const base = sceneProjectOptions('dubbing');
    const options = withSceneBrand(base, playbook);
    expect(options.brand).toMatchObject({ id: 'brand_1', name: 'Mine' });
    expect(options.brand).not.toHaveProperty('source');
    expect(options.caption).toMatchObject({ preset: 'ln-clean', color: '#ffcc00' });
    // The footage decides the canvas shape, not the brand.
    expect(options.aspect).toBe(base.aspect);
    expect(options.dubbing).toBeDefined();
    // Later brand edits never reach the project's copy.
    playbook.blocks.captions.style.color = '#000000';
    expect(options.brand!.blocks.captions!.style!.color).toBe('#ffcc00');
  });

  it('removes the brand and keeps the rest', () => {
    const branded = withSceneBrand(sceneProjectOptions('captions'), emptyPlaybook('brand_1', 'Mine'));
    const plain = withSceneBrand(branded, null);
    expect(plain).not.toHaveProperty('brand');
    expect(plain.caption).toEqual(branded.caption);
  });
});
