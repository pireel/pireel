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

  it('预览帧按视频展示尺寸绘制，不被带旋转元数据的编码面误导成 16:9', () => {
    const draws: unknown[][] = [];
    let onMessage: ((event: { data: Record<string, unknown> }) => void) | undefined;
    const context = {
      clearRect: () => {},
      drawImage: (...args: unknown[]) => draws.push(args),
    };
    const mainCanvas = { width: 1080, height: 1920, getContext: () => context };
    const documentLike = {
      getElementById: (id: string) => (id === 'vidEl' ? mainCanvas : null),
      createElement: () => ({ width: 0, height: 0, getContext: (kind: string) => (kind === '2d' ? context : null) }),
    };
    const windowLike: Record<string, unknown> = {
      getComputedStyle: () => ({ width: '1080px', height: '1920px' }),
      addEventListener: (type: string, listener: (event: { data: Record<string, unknown> }) => void) => {
        if (type === 'message') onMessage = listener;
      },
    };
    new Function('window', 'document', videoFrameShim([]))(windowLike, documentLike);
    const codedLandscapeFrame = { width: 1920, height: 1080, close: () => {} };
    onMessage?.({
      data: {
        type: 'hf:frame',
        frame: codedLandscapeFrame,
        sourceWidth: 1080,
        sourceHeight: 1920,
        t: 0,
      },
    });

    expect(draws.at(-1)).toEqual([codedLandscapeFrame, 0, 0, 1080, 1920]);
  });

  it('画布盒子在帧推送之后被改写时，用保留的位图按新盒子重画，不让已画像素被拉伸', () => {
    const draws: unknown[][] = [];
    let onMessage: ((event: { data: Record<string, unknown> }) => void) | undefined;
    let onResize: (() => void) | undefined;
    const box = { width: '1080px', height: '1920px' };
    const context = {
      clearRect: () => {},
      drawImage: (...args: unknown[]) => draws.push(args),
    };
    const mainCanvas = { width: 1080, height: 1920, getContext: () => context };
    const documentLike = {
      getElementById: (id: string) => (id === 'vidEl' ? mainCanvas : null),
      createElement: () => ({ width: 0, height: 0, getContext: (kind: string) => (kind === '2d' ? context : null) }),
    };
    class ResizeObserverLike {
      constructor(callback: () => void) { onResize = callback; }
      observe() {}
    }
    const windowLike: Record<string, unknown> = {
      ResizeObserver: ResizeObserverLike,
      getComputedStyle: () => box,
      addEventListener: (type: string, listener: (event: { data: Record<string, unknown> }) => void) => {
        if (type === 'message') onMessage = listener;
      },
    };
    new Function('window', 'document', videoFrameShim([]))(windowLike, documentLike);
    const frame = { width: 1080, height: 1920, close: () => {} };
    onMessage?.({ data: { type: 'hf:frame', frame, sourceWidth: 1080, sourceHeight: 1920, t: 2 } });
    expect(draws).toHaveLength(1);

    // the framing timeline halves the media layer's width after the frame was drawn
    box.width = '540px';
    onResize?.();
    const expected = sourceDrawRect(1080, 1920, 540, 1920);
    expect(draws).toHaveLength(2);
    expect(draws[1]).toEqual([frame, expected.x / 0.5, expected.y, expected.width / 0.5, expected.height]);

    // same box again → no redundant redraw
    onResize?.();
    expect(draws).toHaveLength(2);
  });

  it('画布改成竖屏后按等比横屏图层预补偿，不把视频像素一起拉成竖屏', () => {
    const draws: unknown[][] = [];
    let onMessage: ((event: { data: Record<string, unknown> }) => void) | undefined;
    const context = {
      clearRect: () => {},
      drawImage: (...args: unknown[]) => draws.push(args),
    };
    const mainCanvas = { width: 1080, height: 1920, getContext: () => context };
    const documentLike = {
      getElementById: (id: string) => (id === 'vidEl' ? mainCanvas : null),
      createElement: () => ({ width: 0, height: 0, getContext: (kind: string) => (kind === '2d' ? context : null) }),
    };
    const windowLike: Record<string, unknown> = {
      getComputedStyle: () => ({ width: '1080px', height: '607.5px' }),
      addEventListener: (type: string, listener: (event: { data: Record<string, unknown> }) => void) => {
        if (type === 'message') onMessage = listener;
      },
    };
    new Function('window', 'document', videoFrameShim([]))(windowLike, documentLike);
    const landscapeFrame = { width: 1920, height: 1080, close: () => {} };
    onMessage?.({
      data: {
        type: 'hf:frame', frame: landscapeFrame, sourceWidth: 1920, sourceHeight: 1080, t: 0,
      },
    });

    // The backing store is deliberately pre-warped; CSS maps 1080×1920 into the proportional
    // 1080×607.5 media layer. Without this compensation the displayed video is stretched vertically.
    expect(draws.at(-1)).toEqual([landscapeFrame, 0, 0, 1080, 1920]);
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
