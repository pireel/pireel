import { describe, expect, it } from 'vitest';
import { SOURCE_DRAW_RECT_FUNCTION, sourceDrawRect, type SourceDrawRect } from './source-framing';
import { videoFrameShim } from './assemble';

const iframeRect = new Function(`return (${SOURCE_DRAW_RECT_FUNCTION});`)() as (
  sw: number,
  sh: number,
  tw: number,
  th: number,
  framing?: { scale: number; anchorX: number; anchorY: number; coordinateSpace?: 'source-normalized' },
) => SourceDrawRect;

describe('sourceDrawRect', () => {
  it('注入预览 iframe 的完整 frame shim 保持可解析', () => {
    expect(() => new Function(videoFrameShim([]))).not.toThrow();
  });

  it('无显式取景时居中 contain，不裁掉导入素材', () => {
    expect(sourceDrawRect(1920, 1080, 1080, 1920)).toEqual({ x: 0, y: 656.25, width: 1080, height: 607.5 });
    expect(sourceDrawRect(1920, 1080, 1080, 1920, { scale: 2, anchorX: 0, anchorY: 1 })).toEqual(
      sourceDrawRect(1920, 1080, 1080, 1920),
    );
  });

  it('source-normalized 能取回横屏源两侧且不露边', () => {
    const left = sourceDrawRect(1920, 1080, 1080, 1920, { scale: 1, anchorX: 0.15, anchorY: 0.5, coordinateSpace: 'source-normalized' });
    const right = sourceDrawRect(1920, 1080, 1080, 1920, { scale: 1, anchorX: 0.85, anchorY: 0.5, coordinateSpace: 'source-normalized' });
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(1080, 8);
    for (const rect of [left, right]) {
      expect(rect.x).toBeLessThanOrEqual(0);
      expect(rect.y).toBeLessThanOrEqual(0);
      expect(rect.x + rect.width).toBeGreaterThanOrEqual(1080);
      expect(rect.y + rect.height).toBeGreaterThanOrEqual(1920);
    }
  });

  it('iframe 注入公式与 TypeScript/导出公式逐值一致', () => {
    const cases = [
      undefined,
      { scale: 1, anchorX: 0.15, anchorY: 0.5, coordinateSpace: 'source-normalized' as const },
      { scale: 2.2, anchorX: 0.75, anchorY: 0.25, coordinateSpace: 'source-normalized' as const },
      { scale: 3, anchorX: -2, anchorY: 4, coordinateSpace: 'source-normalized' as const },
    ];
    for (const framing of cases) {
      expect(iframeRect(1920, 1080, 1080, 1920, framing)).toEqual(sourceDrawRect(1920, 1080, 1080, 1920, framing));
      expect(iframeRect(1080, 1920, 1920, 1080, framing)).toEqual(sourceDrawRect(1080, 1920, 1920, 1080, framing));
    }
  });
});
