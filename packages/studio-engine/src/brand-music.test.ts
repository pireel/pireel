import { describe, expect, it } from 'vitest';
import { MAX_BRAND_MUSIC, brandMediaEntries, brandMusicTracks, emptyPlaybook, playbookSnapshot, renderBrandPrompt, upgradePlaybook, validatePlaybook, validatePlaybookSnapshot, type BrandAudio } from './brand-playbook';
import { brandMediaAssets } from './brand-media';

const track = (name: string): BrandAudio => ({ key: `uploads/u/${name}.mp3`, kind: 'audio', name, durationSec: 90 });

describe('brand music library', () => {
  it('upgrades a single track without changing its stored data or legacy asset identity', () => {
    const old = { ...emptyPlaybook('b', 'Brand'), media: { music: track('original') } };
    const upgraded = validatePlaybook(old);
    expect(upgraded.media?.music).toEqual([{ ...track('original'), id: 'brand-music' }]);
    expect(old.media.music).toEqual(track('original'));
    expect(upgradePlaybook(upgraded)).toBe(upgraded);
    expect(brandMediaAssets(playbookSnapshot(upgraded))['brand-music'].locator.cloudKey).toBe(track('original').key);
    expect(renderBrandPrompt(upgraded)).toContain('id="brand-music"');
  });

  it('keeps music names and ids consistent between the agent prompt and the project library', () => {
    const brand = { ...emptyPlaybook('b', 'Brand'), media: { music: [track('Warm & calm'), track('Quick rhythm')] } };
    const snapshot = validatePlaybookSnapshot(JSON.parse(JSON.stringify(playbookSnapshot(brand))));
    const assets = brandMediaAssets(snapshot);
    const prompt = renderBrandPrompt(snapshot);
    expect(Object.values(assets)).toHaveLength(2);
    for (const { id, asset } of brandMediaEntries(snapshot)) {
      expect(assets[id].locator.cloudKey).toBe(asset.key);
      expect(prompt).toContain(`id="${id}"`);
    }
    expect(Object.values(assets).map(asset => asset.label)).toEqual(['Warm & calm', 'Quick rhythm']);
    expect(prompt).toContain('name="Warm &amp; calm"');
    expect(prompt).toContain('music entries are alternatives');
  });

  it('does not retarget remaining ids after a track is removed or reordered', () => {
    const brand = { ...emptyPlaybook('b', 'Brand'), media: { music: [track('one'), track('two'), track('three')] } };
    const before = brandMediaAssets(brand);
    brand.media.music = [brand.media.music[2], brand.media.music[1]];
    const after = brandMediaAssets(brand);
    expect(Object.keys(after)).toHaveLength(2);
    for (const id of Object.keys(after)) expect(after[id]).toEqual(before[id]);
    brand.media.music = [];
    expect(brandMusicTracks(validatePlaybook(brand))).toEqual([]);
    expect(brandMediaAssets(brand)).toEqual({});
    expect(renderBrandPrompt(brand)).not.toContain('<music');
  });

  it('refuses invalid, duplicate or over-limit music without dropping other tracks silently', () => {
    const brand = emptyPlaybook('b', 'Brand');
    for (const music of [null, [null], [{ ...track('one'), durationSec: 0 }], [track('one'), track('one')], Array.from({ length: MAX_BRAND_MUSIC + 1 }, (_, i) => track(String(i)))]) {
      expect(() => validatePlaybook({ ...brand, media: { music } })).toThrow(/media.music/);
    }
  });
});
