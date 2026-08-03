import { describe, expect, it } from 'vitest';
import { exportRecommendations } from './export-options';
import type { Composition } from './composition';

const comp = (width: number, height: number): Composition =>
  ({ width, height, theme: 'general', video: { url: 'x', durationSec: 10 }, blocks: [] }) as unknown as Composition;

describe('exportRecommendations', () => {
  it('portrait 1080×1920: vertical platforms cap at 1080, source matches native, YouTube stays 1080', () => {
    const r = exportRecommendations(comp(1080, 1920));
    expect(r.canvas.orientation).toBe('portrait');
    expect(r.source.shortSide).toBe(1080);
    const by = Object.fromEntries(r.options.map((o) => [o.id, o]));
    expect(by.source.resolution).toBe(1080);
    expect(by.xiaohongshu.resolution).toBe(1080);
    expect(by.douyin_tiktok.resolution).toBe(1080);
    expect(by.youtube.resolution).toBe(1080); // vertical → Shorts, not 4K
    expect(r.options.every((o) => o.format === 'mp4')).toBe(true);
  });

  it('landscape 4K source: YouTube scales up to 2160, vertical feeds stay 1080, nothing upscales past native', () => {
    const r = exportRecommendations(comp(3840, 2160));
    expect(r.canvas.orientation).toBe('landscape');
    const by = Object.fromEntries(r.options.map((o) => [o.id, o]));
    expect(by.source.resolution).toBe(2160);
    expect(by.youtube.resolution).toBe(2160);
    expect(by.xiaohongshu.resolution).toBe(1080);
    // vertical-first platforms warn about a landscape cut
    expect(by.xiaohongshu.note).toContain('vertical-first');
  });

  it('never recommends a resolution above the native short side (720p source)', () => {
    const r = exportRecommendations(comp(1280, 720));
    expect(r.options.every((o) => o.resolution <= 720)).toBe(true);
    const by = Object.fromEntries(r.options.map((o) => [o.id, o]));
    expect(by.source.resolution).toBe(720);
    expect(by.youtube.resolution).toBe(720);
  });

  it('set_canvas 后输出比例与源分辨率分开:竖屏画布仍按横屏原片上限推荐', () => {
    const c = comp(1080, 1920);
    c.video = { url: 'x', durationSec: 10, sourceWidth: 3840, sourceHeight: 2160 };
    const r = exportRecommendations(c);
    expect(r.canvas).toMatchObject({ width: 1080, height: 1920, orientation: 'portrait' });
    expect(r.source).toEqual({ shortSide: 2160, longSide: 3840 });
    expect(r.options.find((o) => o.id === 'source')!.note).toContain('1080×1920 canvas');
  });
});
