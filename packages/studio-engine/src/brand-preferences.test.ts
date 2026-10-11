import { describe, expect, it } from 'vitest';
import { brandEditingSkills, brandPreferences } from './brand-preferences';
import { brandStyleText, brandStyleReferences, brandCoverReferenceKeys, emptyPlaybook, playbookSnapshot, renderBrandPrompt, validatePlaybook, validatePlaybookSnapshot } from './brand-playbook';
import { playbookEditParams } from './brand-edit-params';
import { brandMediaAssets } from './brand-media';

const reference = { key: 'uploads/u/style.jpg', kind: 'image' as const, width: 1280, height: 720 };

describe('unified brand settings', () => {
  it('keeps saved layout flags readable but inactive while preserving auto zoom', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.blocks.layout = { text: 'Arrange supporting media beside the speaker.' };
    expect(brandPreferences(brand)).not.toHaveProperty('layout');
    for (const layout of [true, false]) {
      brand.preferences = { layout, zoom: !layout, transitions: false };
      const saved = validatePlaybookSnapshot(JSON.parse(JSON.stringify(playbookSnapshot(validatePlaybook(brand)))));
      expect(brandPreferences(saved)).toMatchObject({ zoom: !layout });
      expect(brandPreferences(saved)).not.toHaveProperty('layout');
      expect(renderBrandPrompt(saved)).not.toContain('layout="');
      expect(renderBrandPrompt(saved)).not.toContain('layout independently permits');
      expect(renderBrandPrompt(saved)).toContain(`zoom="${!layout}"`);
      expect(playbookEditParams(saved).moves?.punchIn ?? false).toBe(!layout);
    }
    expect(() => validatePlaybook({ ...brand, preferences: { layout: 'yes' } })).toThrow(/preferences.layout/);
  });

  it('opens legacy prose and references without losing their source data', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.blocks = { portrait: { text: '清楚直接。' }, graphics: { text: '深色底，暖色强调。', references: [reference] }, layout: { text: '让辅助画面服务内容。', references: [reference] } };
    expect(brandStyleText(brand)).toBe('清楚直接。\n\n让辅助画面服务内容。\n\n深色底，暖色强调。');
    expect(brandStyleReferences(brand)).toEqual([reference]);
    expect(brand.blocks.graphics?.text).toBe('深色底，暖色强调。');
  });

  it('keeps cover references separate and preserves explicit removal across snapshots', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.source.videos = [{ id: 'v', durationSec: 30, coverKey: 'uploads/u/cover.jpg' }];
    brand.style = { text: 'Style', references: [reference, { ...reference, key: 'uploads/u/cover.jpg' }] };
    expect(brandCoverReferenceKeys(brand)).toEqual(['uploads/u/cover.jpg']);
    expect(brandStyleReferences(brand)).toEqual([reference]);
    const snapshot = playbookSnapshot(brand);
    expect(snapshot.blocks.cover?.referenceKeys).toEqual(['uploads/u/cover.jpg']);
    expect(snapshot.style?.references).toEqual([reference]);
    expect(validatePlaybookSnapshot(snapshot).blocks.cover?.referenceKeys).toEqual(['uploads/u/cover.jpg']);
    brand.blocks.cover = { referenceKeys: [] };
    expect(brandCoverReferenceKeys(brand)).toEqual([]);
    expect(brandStyleReferences(brand)).toEqual([reference]);
    expect(playbookSnapshot(brand).blocks.cover?.referenceKeys).toEqual([]);
    expect(() => validatePlaybook({ ...brand, blocks: { cover: { referenceKeys: ['blob:temporary'] } } })).toThrow(/referenceKeys/);
  });

  it('uses the edited description in every editing consumer, without replaying conflicting legacy prose', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.blocks = { graphics: { text: 'OLD GRAPHICS' }, camera: { text: 'OLD CAMERA' }, sound: { text: 'OLD SOUND', lufs: -14 }, overlay_text: { text: 'OLD TITLES', font: 'sans' } };
    brand.style = { text: 'NEW STYLE', references: [reference] };
    brand.preferences = { zoom: false, transitions: false, headlines: false };
    for (const only of [undefined, ['camera', 'sound'] as const, ['overlay_text'] as const]) {
      const prompt = renderBrandPrompt(brand, only);
      expect(prompt).toContain('NEW STYLE');
      expect(prompt).not.toContain('OLD');
      expect(prompt).toContain('zoom="false"');
    }
    expect(playbookEditParams(playbookSnapshot(brand)).moves).toBeUndefined();
    expect(playbookEditParams(playbookSnapshot(brand)).titles).toBeUndefined();
    expect(renderBrandPrompt(brand)).toContain('loudness="-14 LUFS"');
    expect(renderBrandPrompt(brand)).toContain('font="sans"');
    brand.style.text = '';
    expect(brandStyleText(brand)).toBe('');
    expect(renderBrandPrompt(brand)).not.toContain('OLD GRAPHICS');
  });

  it('separates pause cleanup, repeats and denoise when deriving project skills', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.skills = ['rough-cut', 'graphics', 'b-roll'];
    brand.blocks.captions = { on: false };
    brand.preferences = { pauses: false, cleanup: false, denoise: true, graphics: false, broll: true };
    expect(brandEditingSkills(brand)).toEqual(['voice-cleanup', 'b-roll']);
    brand.preferences.cleanup = true;
    expect(brandEditingSkills(brand)).toContain('rough-cut');
    expect(brandPreferences(brand).pauses).toBe(false);
  });

  it('round-trips reusable media and exposes actual identities to the agent and project library', () => {
    const brand = emptyPlaybook('b', 'Brand');
    brand.media = { intro: { key: 'uploads/u/intro.mp4', kind: 'video', width: 1280, height: 720, durationSec: 2 }, music: [{ key: 'uploads/u/music.mp3', kind: 'audio', durationSec: 90 }] };
    const saved = validatePlaybookSnapshot(JSON.parse(JSON.stringify(playbookSnapshot(validatePlaybook(brand)))));
    expect(saved.media).toEqual(brand.media);
    expect(Object.values(brandMediaAssets(saved)).find(asset => asset.kind === 'audio')).toMatchObject({ kind: 'audio', locator: { cloudKey: 'uploads/u/music.mp3' } });
    expect(renderBrandPrompt(saved)).toContain('cloudKey="uploads/u/intro.mp4"');
    expect(renderBrandPrompt(saved)).toContain('register_media');
    expect(() => validatePlaybook({ ...brand, preferences: { zoom: 'yes' } })).toThrow(/preferences.zoom/);
    expect(() => validatePlaybook({ ...brand, media: { music: { key: 'blob:temporary', kind: 'audio', durationSec: 90 } } })).toThrow(/media.music/);
  });
});
