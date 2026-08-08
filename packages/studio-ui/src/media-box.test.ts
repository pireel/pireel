import { describe, expect, it } from 'vitest';
import {
  fittedMediaContentBox,
  framedMediaContentBox,
  framedMediaPlacementBox,
  mediaContentBox,
  mediaPlacementBox,
  moveMediaCanvasBox,
  resizeMediaCanvasBox,
  scaleMediaCanvasBox,
} from './media-box';

describe('media canvas box', () => {
  it('wraps a landscape source instead of the portrait canvas and round-trips placement', () => {
    const fitted = fittedMediaContentBox(1920, 1080, 1080, 1920, 'contain');
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBeCloseTo(0.3418, 4);
    expect(fitted.w).toBe(1);
    expect(fitted.h).toBeCloseTo(0.3164, 4);
    const content = mediaContentBox({ x: -0.1, y: 0.1, w: 1.2, h: 1.2 }, fitted);
    expect(mediaPlacementBox(content, fitted)).toEqual({ x: -0.1, y: 0.1, w: 1.2, h: 1.2 });
  });

  it('allows off-canvas movement without changing size', () => {
    expect(moveMediaCanvasBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.4 }, 0.1, -0.5)).toEqual({
      x: 0.3, y: -0.2, w: 0.4, h: 0.4,
    });
  });

  it('snaps edges and centers while moving', () => {
    expect(moveMediaCanvasBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 0.095, 0.095, 0.01, 0.01)).toEqual({
      x: 0.3, y: 0.3, w: 0.4, h: 0.4,
    });
  });

  it('scales proportionally from a corner and keeps the opposite corner fixed', () => {
    expect(scaleMediaCanvasBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, -0.1, -0.1, -1, -1)).toEqual({
      x: 0.1, y: 0.1, w: 0.5, h: 0.5,
    });
  });

  it('allows proportional enlargement beyond the canvas bounds', () => {
    expect(scaleMediaCanvasBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 1, 1, 1, 1)).toEqual({
      x: 0.2, y: 0.2, w: 1.4, h: 1.4,
    });
  });

  it('resizes each side independently while anchoring the opposite edge', () => {
    expect(resizeMediaCanvasBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.2 }, -0.1, 'l')).toEqual({
      x: 0.1, y: 0.3, w: 0.5, h: 0.2,
    });
    expect(resizeMediaCanvasBox({ x: 0.2, y: 0.3, w: 0.4, h: 0.2 }, 0.1, 'b')).toEqual({
      x: 0.2, y: 0.3, w: 0.4, h: 0.3,
    });
  });

  it('follows a left-half treatment and round-trips the base placement', () => {
    const placement = { x: 0, y: 0, w: 1, h: 1 };
    const fitted = { x: 0, y: 0, w: 1, h: 1 };
    const framing = {
      scale: 1,
      xPercent: -25,
      yPercent: 0,
      inset: { t: 0, r: 0.25, b: 0, l: 0.25 },
    };
    const content = framedMediaContentBox(placement, fitted, framing);
    expect(content).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(framedMediaPlacementBox(content, fitted, framing)).toEqual(placement);
  });

  it('follows right-half crop position and keeps drag inversion exact', () => {
    const placement = { x: -0.1, y: 0.1, w: 1.2, h: 0.8 };
    const fitted = { x: 0, y: 0, w: 1, h: 1 };
    const framing = {
      scale: 1,
      xPercent: 40,
      yPercent: 0,
      inset: { t: 0, r: 0.1, b: 0, l: 0.4 },
    };
    const content = framedMediaContentBox(placement, fitted, framing);
    expect(content).toEqual({ x: 0.86, y: 0.1, w: 0.6, h: 0.8 });
    expect(framedMediaPlacementBox(content, fitted, framing)).toEqual(placement);
  });

  it('follows corner scale after contain fitting and round-trips', () => {
    const placement = { x: 0, y: 0, w: 1, h: 1 };
    const fitted = { x: 0, y: 0.25, w: 1, h: 0.5 };
    const framing = {
      scale: 0.4,
      xPercent: 28,
      yPercent: 28,
      inset: { t: 0, r: 0, b: 0, l: 0 },
    };
    const content = framedMediaContentBox(placement, fitted, framing);
    expect(content).toEqual({ x: 0.58, y: 0.68, w: 0.4, h: 0.2 });
    expect(framedMediaPlacementBox(content, fitted, framing)).toEqual(placement);
  });
});
