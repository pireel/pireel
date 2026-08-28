import { describe, expect, it } from 'vitest';
import {
  PREVIEW_STAGE_VERTICAL_GUTTER_PX,
  previewStageGeometry,
} from './preview-stage-geometry';

describe('preview stage geometry', () => {
  it('reserves symmetric vertical room for selection chrome around a portrait canvas', () => {
    const geometry = previewStageGeometry({
      areaW: 600,
      areaH: 600,
      canvasW: 1080,
      canvasH: 1920,
    });

    expect(geometry.gutterY).toBe(PREVIEW_STAGE_VERTICAL_GUTTER_PX);
    expect(geometry.height).toBe(504);
    expect((600 - geometry.height) / 2).toBeGreaterThanOrEqual(PREVIEW_STAGE_VERTICAL_GUTTER_PX);
  });

  it('also preserves the gutter when a landscape canvas would otherwise nearly fill the height', () => {
    const geometry = previewStageGeometry({
      areaW: 1000,
      areaH: 600,
      canvasW: 1920,
      canvasH: 1080,
    });

    expect(geometry.height).toBe(504);
    expect((600 - geometry.height) / 2).toBeGreaterThanOrEqual(PREVIEW_STAGE_VERTICAL_GUTTER_PX);
  });

  it('reduces the gutter in a short panel instead of collapsing the canvas', () => {
    const geometry = previewStageGeometry({
      areaW: 600,
      areaH: 200,
      canvasW: 1080,
      canvasH: 1920,
    });

    expect(geometry.gutterY).toBe(20);
    expect(geometry.height).toBe(160);
  });
});
