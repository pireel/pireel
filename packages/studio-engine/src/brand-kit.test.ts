import { describe, expect, it } from 'vitest';
import { applyBrandMedia, brandCaptionStyle, brandSnapshot, emptyBrandKit, validateBrandKit, type BrandKit } from './brand-kit';
import { buildCaptionBaseDocument, captionTaskStyle, type CaptionTaskOptions } from './caption-task';

const options: CaptionTaskOptions = { caption: {}, aspect: 'original', shortenPauses: false };
const base = () => buildCaptionBaseDocument({ projectId: 'p', sourceSig: 'src', sourceUrl: 'blob:src', width: 1080, height: 1920, durationSec: 10, options, transcript: [] });
const video = (key: string, durationSec: number) => ({ key, kind: 'video' as const, width: 1080, height: 1920, durationSec });
function kit(patch: Partial<BrandKit> = {}): BrandKit { return { ...emptyBrandKit('brand_1', '我的品牌'), ...patch }; }

describe('brand kit', () => {
  it('refuses invalid fields with the path that failed', () => {
    expect(() => validateBrandKit(kit({ captions: { color: 'red' } }))).toThrow('captions.color');
    expect(() => validateBrandKit(kit({ intro: { key: 'blob:x', kind: 'video', width: 1, height: 1, durationSec: 1 } }))).toThrow('intro');
    expect(() => validateBrandKit(kit({ outro: { key: 'k', kind: 'image', width: 10, height: 10 } }))).toThrow('片尾需要视频');
    expect(validateBrandKit(kit())).toBeTruthy();
  });

  it('copies the brand captions into the scene caption style, which later scene edits override', () => {
    const brand = brandSnapshot(kit({ captions: { preset: 'em-yellow', font: 'web:smiley-sans', color: '#ffee00', yPct: 62, scale: 1.4 } }));
    const branded = { ...options, brand, caption: brandCaptionStyle(brand) };
    const style = captionTaskStyle(branded, { width: 1080, height: 1920 });
    expect(style).toMatchObject({ preset: 'em-yellow', font: 'web:smiley-sans', color: '#ffee00', yPct: 62, scale: 1.4 });
    expect(captionTaskStyle({ ...branded, caption: { ...branded.caption, color: '#000000', yPct: 80 } }, { width: 1080, height: 1920 })).toMatchObject({ color: '#000000', yPct: 80 });
  });

  it('adds intro and outro on the primary track and the logo over the main part only', () => {
    const logo = { key: 'uploads/u/logo.png', kind: 'image' as const, width: 400, height: 200, corner: 'top-right' as const, widthPct: 20, opacity: 0.8 };
    const document = applyBrandMedia(base(), brandSnapshot(kit({ intro: video('uploads/u/intro.mp4', 2), outro: video('uploads/u/outro.mp4', 3), logo })));
    const fps = document.canvas.fps;
    const primary = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)!;
    expect(primary.clips.map(clip => [clip.id, clip.startFrame, clip.durationFrames])).toEqual([
      ['brand-intro', 0, 2 * fps], [expect.any(String), 2 * fps, 10 * fps], ['brand-outro', 12 * fps, 3 * fps],
    ]);
    const layer = document.timeline.tracks.find(track => track.id === 'brand-logo')!;
    const clip = layer.clips[0] as { startFrame: number; durationFrames: number; box: { x: number; y: number; w: number; h: number }; opacity: number };
    expect([clip.startFrame, clip.durationFrames]).toEqual([2 * fps, 10 * fps]);
    expect(clip.box.w).toBeCloseTo(0.2); expect(clip.box.h).toBeCloseTo(0.2 * 0.5 * 1080 / 1920);
    expect(clip.box.x + clip.box.w).toBeCloseTo(0.96); expect(clip.box.y).toBeCloseTo(0.04);
    expect(clip.opacity).toBe(0.8);
    expect(document.assets['brand-logo']?.locator).toEqual({ cloudKey: 'uploads/u/logo.png' });
  });

  it('leaves a document without brand media untouched', () => {
    const document = base();
    expect(applyBrandMedia(document, brandSnapshot(kit()))).toEqual(document);
  });
});
