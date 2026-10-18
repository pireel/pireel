import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';

describe('editing task configuration', () => {
  it('uses the same execution steps with or without a brand for equivalent choices', () => {
    const brand = playbookSnapshot(emptyPlaybook('brand', 'Brand'));
    brand.blocks.captions = { on: true, style: { color: '#ffcc00' } };
    const skills = ['rough-cut', 'captions'];
    expect(resolveEditingRunConfig({ brand, skills }).steps).toEqual(resolveEditingRunConfig({ brand: null, skills }).steps);
    expect(resolveEditingRunConfig({}).skills).toEqual(expect.arrayContaining(skills));
    expect(Object.values(resolveEditingRunConfig({ skills: [] }).steps)).not.toContain(true);
  });
  it('freezes the selected brand and per-edit choices for a resumable task', () => {
    const brand = playbookSnapshot(emptyPlaybook('brand', 'Brand'));
    brand.blocks.captions = { on: true, style: { color: '#ffcc00' } };
    brand.preferences = { cleanup: false, pauses: true, zoom: true };
    const config = resolveEditingRunConfig({ brand, skills: ['rough-cut', 'captions'] });
    brand.blocks.captions.style!.color = '#ffffff'; brand.preferences.cleanup = true;
    expect(config.brand?.blocks.captions?.style?.color).toBe('#ffcc00');
    expect(config.steps.cleanup).toBe(false);
    expect(config.steps.pauses).toBe(true);
    expect(config.visual.zoom).toBe(true);
  });
});

it('leaves transition decisions to the main prompt regardless of legacy brand switches', () => {
  for (const transitions of [true, false]) {
    const brand = playbookSnapshot(emptyPlaybook('b', 'Brand'));
    brand.preferences = { transitions };
    const config = resolveEditingRunConfig({ brand });
    expect(config.visual).not.toHaveProperty('transitions');
    expect(config.brand?.preferences).not.toHaveProperty('transitions');
  }
});
