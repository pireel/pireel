import { describe, expect, it } from 'vitest';
import {
  captionYPctForCanvas,
  deliverySafetyForCanvas,
  isNineSixteenCanvas,
  NINE_SIXTEEN_CAPTION_MAX_Y_PCT,
} from './delivery-safety';

describe('global delivery safety', () => {
  it('recognizes codec-safe and exact 9:16 portrait canvases', () => {
    expect(isNineSixteenCanvas({ width: 1080, height: 1920 })).toBe(true);
    expect(isNineSixteenCanvas({ width: 720, height: 1280 })).toBe(true);
    expect(isNineSixteenCanvas({ width: 1080, height: 1918 })).toBe(true);
    expect(isNineSixteenCanvas({ width: 1080, height: 1350 })).toBe(false);
    expect(isNineSixteenCanvas({ width: 1920, height: 1080 })).toBe(false);
  });

  it('describes one global safe field for every essential 9:16 layer', () => {
    const description = deliverySafetyForCanvas({ width: 1080, height: 1920 });
    expect(description).toContain('Global 9:16 delivery-safe field');
    expect(description).toContain('faces');
    expect(description).toContain('titles');
    expect(description).toContain('captions');
    expect(description).toContain('CTA');
    expect(description).toContain('x=8–80%');
    expect(description).toContain('y=12–72%');
    expect(deliverySafetyForCanvas({ width: 1920, height: 1080 })).toBeUndefined();
  });

  it('automatically clamps 9:16 captions without a platform-specific switch', () => {
    expect(captionYPctForCanvas({ width: 1080, height: 1920 }, undefined)).toBeUndefined();
    expect(captionYPctForCanvas({ width: 1080, height: 1920 }, 81)).toBe(72);
    expect(captionYPctForCanvas({ width: 1080, height: 1920 }, 68)).toBe(68);
    expect(captionYPctForCanvas({ width: 1920, height: 1080 }, 81)).toBe(81);
    expect(captionYPctForCanvas({ width: 1920, height: 1080 }, undefined)).toBeUndefined();
    expect(NINE_SIXTEEN_CAPTION_MAX_Y_PCT).toBe(72);
  });
});
