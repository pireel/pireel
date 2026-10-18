import { describe, it, expect } from 'vitest';
import { activeBrandSetting, brandFeaturePrompt, BRAND_PROMPT_FEATURES } from './brand-feature-settings';
import { activeBrandCover, brandGraphicsStyle, brandMediaEntries, emptyPlaybook, fixedBrandConfiguration, playbookSnapshot, renderBrandPrompt, validatePlaybook } from './brand-playbook';
import { playbookAppearance, applyPlaybookMedia } from './brand-media';
import { resolveEditingRunConfig } from './editing-run-config';
import { compositionToEditorDocument, emptyComposition } from './composition';

function brand() {
  const b = emptyPlaybook('b', 'Brand');
  b.preferences = Object.fromEntries(BRAND_PROMPT_FEATURES.map(id => [id, true]));
  b.settings = Object.fromEntries(BRAND_PROMPT_FEATURES.map(id => [id, { prompt: `${id}-INSTRUCTION` }]));
  b.settings.graphics!.theme = { background: '#111111', foreground: '#eeeeee', accent: '#ffcc00', font: 'sans' };
  return b;
}
describe('brand feature settings', () => {
  it('saves settings per feature, freezes project copies and keeps disabled settings without executing them', () => {
    const b = brand(); const saved = validatePlaybook(JSON.parse(JSON.stringify(fixedBrandConfiguration(b)))); const copy = playbookSnapshot(saved);
    b.settings!.graphics!.prompt = 'changed';
    expect(copy.settings!.graphics!.prompt).toBe('graphics-INSTRUCTION');
    for (const id of BRAND_PROMPT_FEATURES) {
      expect(brandFeaturePrompt(copy, id)).toContain(`${id}-INSTRUCTION`);
      copy.preferences![id] = false;
      expect(activeBrandSetting(copy, id)).toBeUndefined();
      expect(brandFeaturePrompt(copy, id)).toBeNull();
      expect(copy.settings![id]!.prompt).toBe(`${id}-INSTRUCTION`);
    }
    expect(brandGraphicsStyle(copy)).toBeNull(); expect(activeBrandCover(copy)).toBeUndefined();
    expect(renderBrandPrompt(copy)).not.toContain('-INSTRUCTION');
  });
  it('passes only requested feature guidance to each consumer', () => {
    const b = brand();
    const mg = brandGraphicsStyle(b)!;
    expect(mg).toContain('graphics-INSTRUCTION'); expect(mg).toContain('#ffcc00'); expect(mg).not.toContain('broll-INSTRUCTION');
    const cover = activeBrandCover(b)!;
    expect(cover.design).toContain('cover-INSTRUCTION'); expect(cover.design).not.toContain('graphics-INSTRUCTION');
    const titles = renderBrandPrompt(b, ['overlay_text']);
    expect(titles).toContain('headlines-INSTRUCTION'); expect(titles).not.toContain('graphics-INSTRUCTION');
    expect(renderBrandPrompt(b, ['cover'])).not.toContain('broll-INSTRUCTION');
    expect(renderBrandPrompt(b, ['transitions'])).not.toContain('feature_settings');
  });
  it('applies only the enabled MG theme to generated graphics', () => {
    const b = brand();
    expect(playbookAppearance(b).palette).toMatchObject({ panel: '#111111', fg: '#eeeeee', accent: '#ffcc00' });
    b.preferences!.graphics = false;
    expect(playbookAppearance(b).palette).toEqual({});
  });
  it('gates fixed media and loudness without deleting the saved assets or parameters', () => {
    const b = brand();
    b.blocks.logo = { key: 'uploads/logo.png', kind: 'image', width: 100, height: 100, corner: 'top-right', widthPct: 10, opacity: 1 };
    b.blocks.sound = { lufs: -14 };
    b.media = { intro: { key: 'uploads/intro.mp4', kind: 'video', width: 1920, height: 1080, durationSec: 2 }, music: [{ key: 'uploads/music.mp3', kind: 'audio', durationSec: 60 }] };
    expect(resolveEditingRunConfig({ brand: b }).steps).toMatchObject({ logo: true, loudness: true });
    expect(brandMediaEntries(b)).toHaveLength(2);
    b.preferences = { ...b.preferences, logo: false, loudness: false, intro: false, music: false };
    expect(resolveEditingRunConfig({ brand: b }).steps).toMatchObject({ logo: false, loudness: false });
    expect(brandMediaEntries(b)).toEqual([]);
    expect(renderBrandPrompt(b)).not.toContain('uploads/intro');
    expect(renderBrandPrompt(b)).not.toContain('loudness="-14 LUFS"');
    const d = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
    expect(applyPlaybookMedia(d, b)).toBe(d);
    expect(playbookSnapshot(b).blocks.logo).toEqual(b.blocks.logo);
  });
  it('discards retired transition switches and configuration', () => {
    const b = { ...brand(), preferences: { transitions: true }, settings: { transitions: { prompt: 'RETIRED TRANSITION PROMPT' }, broll: { prompt: 'Keep this B-roll prompt' } } };
    const saved = validatePlaybook(b);
    expect(saved.settings).not.toHaveProperty('transitions');
    expect(saved.settings?.broll?.prompt).toBe('Keep this B-roll prompt');
    expect(playbookSnapshot(b).settings).not.toHaveProperty('transitions');
    expect(saved.preferences).not.toHaveProperty('transitions');
    expect(renderBrandPrompt(b)).not.toContain('transitions=');
    expect(renderBrandPrompt(b)).not.toContain('RETIRED TRANSITION PROMPT');
    expect(b.settings.transitions.prompt).toBe('RETIRED TRANSITION PROMPT');
  });
  it('rejects invalid themes and oversized or unknown feature settings before storage', () => {
    for (const settings of [{ unknown: { prompt: 'x' } }, { graphics: { prompt: 'x'.repeat(4001) } }, { graphics: { theme: { accent: 'red' } } }, { broll: { theme: { accent: '#123456' } } }, { graphics: { theme: { css: 'unsafe' } } }]) {
      expect(() => validatePlaybook({ ...brand(), settings })).toThrow(/settings/);
    }
  });
});
