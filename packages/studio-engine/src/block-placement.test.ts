import { describe, expect, it } from 'vitest';
import { type Block, applyBlockPlacement, zoneOf } from './composition-core';

function blk(box?: { x: number; y: number; w: number; h: number }, contentBox?: { x: number; y: number; w: number; h: number }): Block {
  return { id: 'b1', templateId: 'custom', slots: {}, startSec: 0, durationSec: 3, trackIndex: 0, box, contentBox } as Block;
}

describe('zoneOf', () => {
  it('3×3 栅格按中心点归类', () => {
    expect(zoneOf({ x: 0.02, y: 0.02, w: 0.2, h: 0.1 })).toBe('top-left');
    expect(zoneOf({ x: 0.4, y: 0.45, w: 0.2, h: 0.1 })).toBe('center');
    expect(zoneOf({ x: 0.75, y: 0.85, w: 0.2, h: 0.1 })).toBe('bottom-right');
    expect(zoneOf({ x: 0.4, y: 0.02, w: 0.2, h: 0.1 })).toBe('top');
    expect(zoneOf({ x: 0.02, y: 0.45, w: 0.2, h: 0.1 })).toBe('left');
  });
});

describe('applyBlockPlacement', () => {
  it('anchor:吸附到画面区域(保尺寸,带边距)', () => {
    const r = applyBlockPlacement(blk({ x: 0.4, y: 0.4, w: 0.3, h: 0.2 }), { anchor: 'top-right' })!;
    expect(r.box).toEqual({ x: 0.67, y: 0.03, w: 0.3, h: 0.2 });
    expect(zoneOf(r.box!)).toBe('top-right');
  });

  it('anchor center:水平垂直居中', () => {
    const r = applyBlockPlacement(blk({ x: 0, y: 0, w: 0.4, h: 0.2 }), { anchor: 'center' })!;
    expect(r.box!.x).toBeCloseTo(0.3);
    expect(r.box!.y).toBeCloseTo(0.4);
  });

  it('xPct/yPct:绝对定位,越界收进画布', () => {
    const r = applyBlockPlacement(blk({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }), { xPct: 90, yPct: 95 })!;
    expect(r.box!.x).toBeCloseTo(0.7); // clamp 到 1-w
    expect(r.box!.y).toBeCloseTo(0.8); // clamp 到 1-h
  });

  it('dxPct/dyPct:相对推移', () => {
    const r = applyBlockPlacement(blk({ x: 0.1, y: 0.2, w: 0.3, h: 0.2 }), { dyPct: 10 })!;
    expect(r.box!.x).toBeCloseTo(0.1);
    expect(r.box!.y).toBeCloseTo(0.3);
  });

  it('平移时 contentBox 同步移动(裁剪关系不变)', () => {
    const r = applyBlockPlacement(blk({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, { x: 0.05, y: 0.05, w: 0.4, h: 0.3 }), { dxPct: 20 })!;
    expect(r.box!.x).toBeCloseTo(0.3);
    expect(r.contentBox!.x).toBeCloseTo(0.25);
    expect(r.contentBox!.y).toBeCloseTo(0.05);
  });

  it('scale:围绕中心缩放并重置 contentBox(对齐角柄语义)', () => {
    const r = applyBlockPlacement(blk({ x: 0.2, y: 0.2, w: 0.4, h: 0.2 }, { x: 0.1, y: 0.1, w: 0.6, h: 0.4 }), { scale: 0.5 })!;
    expect(r.box).toEqual({ x: 0.3, y: 0.25, w: 0.2, h: 0.1 });
    expect(r.contentBox).toBeUndefined();
  });

  it('scale 与 anchor 组合:先缩放再吸附', () => {
    const r = applyBlockPlacement(blk({ x: 0.4, y: 0.4, w: 0.4, h: 0.2 }), { scale: 0.5, anchor: 'bottom-left' })!;
    expect(r.box).toEqual({ x: 0.03, y: 0.87, w: 0.2, h: 0.1 });
  });

  it('scale 越界收进 0.4–2', () => {
    const r = applyBlockPlacement(blk({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }), { scale: 10 })!;
    expect(r.box!.w).toBeCloseTo(0.4);
    expect(r.box!.h).toBeCloseTo(0.2);
  });

  it('widthPct/heightPct 可独立改变宽高并围绕中心调整', () => {
    const r = applyBlockPlacement(
      blk({ x: 0.2, y: 0.3, w: 0.4, h: 0.2 }, { x: 0.1, y: 0.2, w: 0.6, h: 0.4 }),
      { widthPct: 60, heightPct: 10 },
    )!;
    expect(r.box).toEqual({ x: 0.1, y: 0.35, w: 0.6, h: 0.1 });
    expect(r.contentBox).toBeUndefined();
  });

  it('无有效指令 → null;无 box → null', () => {
    expect(applyBlockPlacement(blk({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }), {})).toBeNull();
    expect(applyBlockPlacement(blk({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }), { scale: 1 })).toBeNull();
    expect(applyBlockPlacement(blk(undefined), { anchor: 'center' })).toBeNull();
  });
});
