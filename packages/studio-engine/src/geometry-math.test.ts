import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W, type FrameGeom, largestEmptyRect, safeZoneForRange } from './geometry-math';

function frame(occ: Uint8Array, face: FrameGeom['face'] = null, t = 0): FrameGeom {
  return { t, face, occ };
}
function blockCols(from: number, to: number): Uint8Array {
  const occ = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) for (let x = from; x < to; x++) occ[y * GRID_W + x] = 1;
  return occ;
}

describe('largestEmptyRect', () => {
  it('全空 → 满格矩形', () => {
    const r = largestEmptyRect(new Uint8Array(GRID_W * GRID_H));
    expect(r).toEqual({ x: 0, y: 0, w: GRID_W, h: GRID_H });
  });
});

describe('safeZoneForRange', () => {
  it('人物居中 → 安全区落两侧,不压主体', () => {
    const sz = safeZoneForRange([frame(blockCols(6, 12))], 0, 1);
    // 主体 bbox = 中间 6 列
    expect(sz.subject?.x).toBeCloseTo(6 / GRID_W, 5);
    expect(sz.subject?.w).toBeCloseTo(6 / GRID_W, 5);
    // 两块安全区
    expect(sz.rects.length).toBe(2);
    const lo = 6 / GRID_W;
    const hi = 12 / GRID_W;
    for (const r of sz.rects) {
      const overlaps = r.x < hi - 1e-9 && r.x + r.w > lo + 1e-9;
      expect(overlaps).toBe(false); // 不与主体水平重叠
    }
  });

  it('段内并集:人物从左移到右 → 两帧占用都避开', () => {
    const sz = safeZoneForRange([frame(blockCols(0, 5), null, 0), frame(blockCols(13, 18), null, 1)], 0, 1);
    // 安全区集中在中间(两侧各被一帧占过)
    for (const r of sz.rects) {
      expect(r.x).toBeGreaterThan(5 / GRID_W - 1e-9);
      expect(r.x + r.w).toBeLessThan(13 / GRID_W + 1e-9);
    }
  });

  it('人脸是硬禁区,安全区避开(带 padding)', () => {
    const face = { x: 0.35, y: 0.05, w: 0.3, h: 0.2 };
    const sz = safeZoneForRange([frame(new Uint8Array(GRID_W * GRID_H), face)], 0, 1);
    expect(sz.face).toEqual(face);
    // 顶部中间被脸占,最大空矩形应在脸下方(y 起点高于脸底)
    const top = sz.rects[0]!;
    expect(top.y).toBeGreaterThan(face.y + face.h - 0.06);
  });
});
