import { describe, expect, it } from 'vitest';
import { fitElementDesignBox } from './element-insert-geometry';

describe('组件设计画布插入几何', () => {
  it('竖屏画布中保持 16:9、居中，并只占适配窗口的指定比例', () => {
    const box = fitElementDesignBox({
      canvasW: 1080,
      canvasH: 1920,
      designW: 1920,
      designH: 1080,
      sourceBox: { x: 0, y: 0, w: 1, h: 1 },
      initialScale: 0.56,
    });

    expect(box.x + box.w / 2).toBeCloseTo(0.5);
    expect(box.y + box.h / 2).toBeCloseTo(0.5);
    expect((box.w * 1080) / (box.h * 1920)).toBeCloseTo(16 / 9);
    expect(box.w).toBeCloseTo(0.5376);
  });

  it('普通局部元素仍映射到完整设计窗口，不受整卡初始比例影响', () => {
    const box = fitElementDesignBox({
      canvasW: 1920,
      canvasH: 1080,
      designW: 1920,
      designH: 1080,
      sourceBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      initialScale: 0.56,
    });

    expect(box.x).toBeCloseTo(0.116);
    expect(box.y).toBeCloseTo(0.212);
    expect(box.w).toBeCloseTo(0.288);
    expect(box.h).toBeCloseTo(0.384);
  });
});
