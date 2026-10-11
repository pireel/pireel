import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { storedCaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { captionWorkflowDefinition } from '@pireel/studio-engine/workflow-caption-template';
import { withSceneBrand } from './scene-brand-picker';
import { sceneProjectOptions } from './caption-upload-dialog';

describe('withSceneBrand', () => {
  const fullBrand = () => ({ ...emptyPlaybook('b', 'Full brand'), style: { text: 'Full editing style' }, preferences: { zoom: true }, media: { intro: { key: 'intro.mp4', kind: 'video' as const, width: 1080, height: 1920, durationSec: 2 } }, blocks: {
    captions: { on: true, accent: 'keywords' as const, style: { color: '#ffcc00' } },
    logo: { key: 'logo.png', kind: 'image' as const, width: 100, height: 100, corner: 'top-right' as const, widthPct: 10, opacity: 1 },
    sound: { lufs: -14, pauses: 'tight' as const }, overlay_text: { font: 'serif', text: 'Add titles' },
  } });

  it.each(['captions', 'dubbing', 'broll', 'pip', 'ugc-ad'] as const)('takes only caption settings for %s', scene => {
    const base = sceneProjectOptions(scene);
    const options = withSceneBrand(base, fullBrand());
    expect(options.brand?.blocks).toEqual({ captions: fullBrand().blocks.captions });
    expect(options.brand?.style).toBeUndefined();
    expect(options.brand?.media).toBeUndefined();
    expect(options.brand?.preferences).toBeUndefined();
    expect(options.edit).toBeUndefined();
    expect(options.shortenPauses).toBe(base.shortenPauses);
    expect(options.highlights).toBe(true);
    const steps = captionWorkflowDefinition(options, null).steps;
    expect(steps.some(step => ['brand', 'titles', 'editplan', 'loudness'].includes(step.id))).toBe(false);
  });

  it.each(['sfx', 'subtitle-removal'] as const)('does not apply an unrelated brand to %s', scene => {
    const options = withSceneBrand(sceneProjectOptions(scene), fullBrand());
    expect(options.brand).toBeUndefined();
    expect(options.caption).toEqual({});
  });

  it('scopes old full-brand scene options on load and execution, keeping full one-click edits intact', () => {
    const legacy = { ...sceneProjectOptions('captions'), brand: playbookSnapshot(fullBrand()), edit: { moves: { punchIn: true }, targetLufs: -14, titles: true } };
    const restored = storedCaptionTaskOptions(legacy);
    expect(restored.brand?.blocks.logo).toBeUndefined();
    expect(restored.edit).toBeUndefined();
    expect(captionWorkflowDefinition(legacy, null).steps.some(step => ['brand', 'titles', 'editplan', 'loudness'].includes(step.id))).toBe(false);
    const full = withSceneBrand({ ...legacy, oneClick: true }, fullBrand());
    expect(full.brand?.blocks.logo).toEqual(fullBrand().blocks.logo);
    expect(full.edit?.moves?.punchIn).toBe(true);
    expect(captionWorkflowDefinition(full, null).steps.some(step => step.id === 'brand')).toBe(true);
  });

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
