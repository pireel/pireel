import { describe, expect, it } from 'vitest';
import { CUSTOM_STYLE_PALETTES, DEFAULT_CUSTOM_VISUAL_STYLE, type CustomVisualStyle } from '@pireel/studio-engine/visual-style';
import { motionGraphicPreviewBox, previewSafeZones, visualDirectionThumbnailPalette } from './custom-frame-dialog';

const style = (patch: Partial<CustomVisualStyle>): CustomVisualStyle => ({ ...DEFAULT_CUSTOM_VISUAL_STYLE, ...patch });

describe('custom frame Motion Graphic samples', () => {
  it('keeps catalog direction colors independent from the editable palette', () => {
    const signature = { ...CUSTOM_STYLE_PALETTES.ember };
    expect(visualDirectionThumbnailPalette({ palette: signature })).toBe(signature);
    expect(visualDirectionThumbnailPalette({ palette: null })).toBe(CUSTOM_STYLE_PALETTES.monochrome);
  });

  it('puts information-led Motion Graphics opposite the presenter in split layouts', () => {
    expect(motionGraphicPreviewBox(style({ layout: 'split-top-bottom', topBottomPresenter: 'top' }), 'data').y).toBeGreaterThan(0.5);
    expect(motionGraphicPreviewBox(style({ layout: 'split-top-bottom', topBottomPresenter: 'bottom' }), 'data').y).toBeLessThan(0.5);
    expect(motionGraphicPreviewBox(style({ layout: 'split-left-right', leftRightPresenter: 'left' }), 'data').x).toBeGreaterThan(0.5);
    expect(motionGraphicPreviewBox(style({ layout: 'split-left-right', leftRightPresenter: 'right' }), 'data').x).toBeLessThan(0.5);
  });

  it('puts information-led Motion Graphics opposite all four presenter corners', () => {
    expect(motionGraphicPreviewBox(style({ layout: 'presenter-corner', presenterCorner: 'top-left' }), 'source').x).toBeGreaterThan(0.3);
    expect(motionGraphicPreviewBox(style({ layout: 'presenter-corner', presenterCorner: 'bottom-left' }), 'source').x).toBeGreaterThan(0.3);
    expect(motionGraphicPreviewBox(style({ layout: 'presenter-corner', presenterCorner: 'top-right' }), 'source').x).toBeLessThan(0.1);
    expect(motionGraphicPreviewBox(style({ layout: 'presenter-corner', presenterCorner: 'bottom-right' }), 'source').x).toBeLessThan(0.1);
  });

  it('keeps lower thirds above captions and all other samples inside the content plane', () => {
    const overlay = motionGraphicPreviewBox(style({ layout: 'split-left-right' }), 'overlay');
    const brand = motionGraphicPreviewBox(style({ layout: 'presenter-corner' }), 'brand');
    const splitZones = previewSafeZones(style({ layout: 'split-left-right' }));
    const cornerZones = previewSafeZones(style({ layout: 'presenter-corner' }));
    expect(overlay.y).toBeGreaterThan(0.5);
    expect(overlay.y + overlay.h).toBeLessThan(splitZones.captions.y);
    expect(brand).toEqual(cornerZones.content);
  });

  it('reserves non-overlapping subject, content and caption safe zones for every layout', () => {
    const styles = [
      style({ layout: 'smart' }),
      style({ layout: 'split-top-bottom', topBottomPresenter: 'top' }),
      style({ layout: 'split-top-bottom', topBottomPresenter: 'bottom' }),
      style({ layout: 'split-left-right', leftRightPresenter: 'left' }),
      style({ layout: 'split-left-right', leftRightPresenter: 'right' }),
      style({ layout: 'presenter-corner', presenterCorner: 'top-left' }),
      style({ layout: 'presenter-corner', presenterCorner: 'top-right' }),
      style({ layout: 'presenter-corner', presenterCorner: 'bottom-left' }),
      style({ layout: 'presenter-corner', presenterCorner: 'bottom-right' }),
    ];
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)
      && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

    for (const current of styles) {
      const zones = previewSafeZones(current);
      expect(overlaps(zones.content, zones.subject)).toBe(false);
      expect(overlaps(zones.content, zones.captions)).toBe(false);
    }
  });
});
