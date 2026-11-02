import { describe, expect, it } from 'vitest';
import { fitGraphic, headRectFromFace, minReadableGraphicFontPx } from './graphic-fit';

const canvas = { width: 1080, height: 1920 };
const head = { ...headRectFromFace({ x: 300, y: 700, w: 480, h: 400 }), kind: 'face' as const };

describe('fitGraphic', () => {
  it('leaves a readable graphic that clears the face alone', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.05, w: 0.88, h: 0.08 } },
      measure: { ink: { x: 70, y: 100, w: 700, h: 120 }, paint: { x: 70, y: 100, w: 700, h: 120 }, minFontPx: 48 },
      obstacles: [head],
    });
    expect(fit).toEqual({ geometry: null, changes: [], unresolved: [] });
  });

  it('moves a graphic off the face to the nearest free area, keeping its size and layout', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.19, w: 0.8, h: 0.2 } },
      measure: { ink: { x: 70, y: 370, w: 600, h: 300 }, paint: { x: 70, y: 370, w: 600, h: 300 }, minFontPx: 40 },
      obstacles: [head],
    });
    expect(fit.geometry).not.toBeNull();
    expect(fit.geometry!.scale).toBe(1);
    expect(fit.changes.join(' ')).toContain('to clear the face');
    // Its ink now ends above the head (with a margin) and stays inside the frame.
    const dy = fit.geometry!.box.y * 1920 - 0.19 * 1920;
    expect(370 + dy + 300).toBeLessThanOrEqual(head.y);
    expect(370 + dy).toBeGreaterThanOrEqual(1920 * 0.03 - 1);
    // The layout box keeps its size: the piece does not reflow.
    expect(fit.geometry!.contentBox.w).toBeCloseTo(0.8, 3);
    expect(fit.geometry!.contentBox.h).toBeCloseTo(0.2, 3);
  });

  it('enlarges text below the readable size around the side it hugs', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.05, y: 0.75, w: 0.4, h: 0.05 } },
      measure: { ink: { x: 54, y: 1440, w: 300, h: 60 }, paint: { x: 54, y: 1440, w: 300, h: 60 }, minFontPx: 22 },
      obstacles: [],
    });
    const floor = minReadableGraphicFontPx(canvas);
    expect(fit.geometry!.scale).toBeCloseTo(floor / 22, 2);
    expect(fit.geometry!.box.x).toBeCloseTo(0.05, 3);
    expect(fit.changes[0]).toContain('enlarged');
  });

  it('widens a box its content spills out of, and shrinks a little when nothing else clears the face', () => {
    const spilled = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.04, w: 0.88, h: 0.056 } },
      measure: { ink: { x: 65, y: 80, w: 500, h: 220 }, paint: { x: 65, y: 80, w: 500, h: 220 }, minFontPx: 40 },
      obstacles: [],
    });
    expect(spilled.changes.join(' ')).toContain('spilled');
    expect(spilled.geometry!.box.y + spilled.geometry!.box.h).toBeGreaterThanOrEqual((80 + 220) / 1920 - 1e-3);

    // A tall card between the face and the top edge: a slightly smaller copy fits above the head,
    // which beats moving it to the other end of the frame.
    const squeezed = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.05, w: 0.88, h: 0.3 } },
      measure: { ink: { x: 65, y: 96, w: 900, h: 560 }, paint: { x: 65, y: 96, w: 900, h: 560 }, minFontPx: 60 },
      obstacles: [head],
    });
    expect(squeezed.unresolved).toEqual([]);
    expect(squeezed.geometry!.scale).toBeLessThan(1);
    expect(squeezed.geometry!.scale).toBeGreaterThanOrEqual(0.75);
  });

  it('says what is left when no free area fits', () => {
    const everywhere = { x: 0, y: 0, w: 1080, h: 1920, kind: 'face' as const };
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.1, y: 0.4, w: 0.8, h: 0.1 } },
      measure: { ink: { x: 108, y: 768, w: 864, h: 192 }, paint: { x: 108, y: 768, w: 864, h: 192 }, minFontPx: 50 },
      obstacles: [everywhere],
    });
    expect(fit.unresolved[0]).toContain('still covers the face');
  });

  it('lets a background wash sit over the speaker', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0, y: 0, w: 1, h: 0.42 } },
      measure: { ink: null, paint: { x: 0, y: 0, w: 1080, h: 806 }, minFontPx: null },
      obstacles: [head],
    });
    expect(fit.geometry).toBeNull();
  });
});

describe('fitGraphic growth limits', () => {
  it('stops enlarging before the headline gets oversized, and asks for the small text to be raised', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.05, w: 0.88, h: 0.15 } },
      measure: { ink: { x: 65, y: 96, w: 660, h: 230 }, paint: { x: 65, y: 96, w: 660, h: 230 }, minFontPx: 20, maxFontPx: 94 },
      obstacles: [],
    });
    expect(fit.geometry!.scale).toBeCloseTo(108 / 94, 2);
    expect(fit.unresolved[0]).toContain("raise that text's size in the piece css");
  });

  it('leaves the size alone on a second pass', () => {
    const fit = fitGraphic({
      canvas,
      geometry: { box: { x: 0.06, y: 0.05, w: 0.88, h: 0.15 } },
      measure: { ink: { x: 65, y: 96, w: 660, h: 230 }, paint: { x: 65, y: 96, w: 660, h: 230 }, minFontPx: 20, maxFontPx: 40 },
      obstacles: [],
      grow: false,
    });
    expect(fit.geometry).toBeNull();
    expect(fit.unresolved).toEqual([expect.stringContaining('smallest text is 20px')]);
  });
});
