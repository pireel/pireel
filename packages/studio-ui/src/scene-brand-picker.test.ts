import { describe, expect, it } from 'vitest';
import { emptyBrandKit } from '@pireel/studio-engine/brand-kit';
import { withSceneBrand } from './scene-brand-picker';
import { sceneProjectOptions } from './caption-upload-dialog';

describe('withSceneBrand', () => {
  it('starts a scene from a copy of the brand, its captions and its aspect', () => {
    const kit = { ...emptyBrandKit('brand_1', 'Mine'), framing: { aspect: '16:9' as const, treatment: 'full' as const }, captions: { preset: 'ln-clean', color: '#ffcc00' } };
    const options = withSceneBrand(sceneProjectOptions('dubbing'), kit);
    expect(options.brand).toMatchObject({ id: 'brand_1', name: 'Mine' });
    expect(options.brand).not.toHaveProperty('source');
    expect(options.caption).toMatchObject({ preset: 'ln-clean', color: '#ffcc00' });
    expect(options.aspect).toBe('landscape');
    expect(options.dubbing).toBeDefined();
    // Later brand edits never reach the project's copy.
    kit.captions.color = '#000000';
    expect(options.brand!.captions.color).toBe('#ffcc00');
  });

  it('removes the brand and keeps the rest', () => {
    const branded = withSceneBrand(sceneProjectOptions('captions'), emptyBrandKit('brand_1', 'Mine'));
    const plain = withSceneBrand(branded, null);
    expect(plain).not.toHaveProperty('brand');
    expect(plain.caption).toEqual(branded.caption);
  });
});
