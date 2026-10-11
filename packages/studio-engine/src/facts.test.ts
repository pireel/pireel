import { describe, expect, it } from 'vitest';
import { captionBandRects, platformZonesPx, regionGridFromRgba, regionsByShot } from './facts';
import { emptyComposition } from './composition';

/** A w×h RGBA image whose top half is flat white and bottom half is black/white stripes. */
function halfFlatHalfStriped(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = y < h / 2 ? 255 : x % 2 ? 255 : 0;
      px[o] = v; px[o + 1] = v; px[o + 2] = v; px[o + 3] = 255;
    }
  }
  return px;
}

describe('region grid', () => {
  it('reads flat areas as calm and bright, detailed areas as busy', () => {
    const grid = regionGridFromRgba(halfFlatHalfStriped(30, 50), 30, 50);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toHaveLength(3);
    const top = grid[0]![1]!;
    const bottom = grid[4]![1]!;
    expect(top.bright).toBeCloseTo(1, 1);
    expect(top.busy).toBeLessThan(0.05);
    expect(top.color).toBe('#ffffff');
    expect(bottom.busy).toBeGreaterThan(0.9);
    expect(bottom.bright).toBeCloseTo(0.5, 1);
  });

  it('summarizes per shot, split at cuts, with the brightness range of each shot', () => {
    const bright = regionGridFromRgba(new Uint8ClampedArray(9 * 15 * 4).fill(255), 9, 15);
    const dark = regionGridFromRgba(new Uint8ClampedArray(9 * 15 * 4).map((_, i) => (i % 4 === 3 ? 255 : 0)), 9, 15);
    const samples = [
      { t: 0.5, grid: bright },
      { t: 1.5, grid: bright },
      { t: 2.5, grid: dark },
      { t: 3.5, grid: bright },
    ];
    const shots = regionsByShot(samples, [2], 4);
    expect(shots.map((s) => [s.start, s.end])).toEqual([[0, 2], [2, 4]]);
    expect(shots[0]!.grid[0]![0]!.bright).toBe(1);
    expect(shots[1]!.brightRange).toEqual([0, 1]);
    // A shot with no sample borrows the nearest one instead of vanishing.
    expect(regionsByShot([{ t: 0.5, grid: bright }], [0.8], 1)).toHaveLength(2);
  });
});

describe('reserved areas', () => {
  it('places the caption band above its bottom anchor, sized by scale and lines', () => {
    const comp = { ...emptyComposition(), width: 1080, height: 1920, captionStyle: { preset: 'clean', yPct: 88, scale: 1 } };
    const { main } = captionBandRects(comp, { lines: 2 });
    expect(main.y + main.h).toBe(Math.round(0.88 * 1920));
    expect(main.h).toBeGreaterThan(64 * 2);
    const bigger = captionBandRects({ ...comp, captionStyle: { preset: 'clean', yPct: 88, scale: 1.5 } }, { lines: 2 }).main;
    expect(bigger.h).toBeGreaterThan(main.h);
    const withSub = captionBandRects(comp, { lines: 1, withTranslation: true });
    expect(withSub.translation!.y).toBeGreaterThan(withSub.main.y);
  });

  it('gives platform zones in canvas px', () => {
    const zones = platformZonesPx(1080, 1920);
    expect(zones.douyin!.zones[0]).toMatchObject({ x: 0, y: 0, w: 1080 });
    expect(Object.keys(zones)).toEqual(expect.arrayContaining(['douyin', 'channels']));
  });
});
